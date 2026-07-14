import type { LLMProvider, Message, ToolCall } from '../core/llm/types.js';
import { parseActions } from '../core/action-parser.js';
import { shouldStop } from '../core/stop-judge.js';
import { checkAction } from '../governance/guardrail.js';
import type { GuardrailDecision } from '../governance/guardrail.js';
import { HITLStateMachine, SessionTerminatedError } from '../governance/hitl-state-machine.js';
import type { HITLEvent } from '../governance/hitl-state-machine.js';
import { parseTestResult, parseLintResult } from '../feedback/feedback-parsers.js';
import { classifyFailures } from '../feedback/failure-classifier.js';
import { formatFeedbackReport } from '../feedback/feedback-injector.js';
import type { FeedbackCheck } from '../feedback/feedback-injector.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { ToolResult } from '../tools/types.js';

/**
 * Configuration for the agent loop.
 */
export interface AgentLoopConfig {
  maxTurns: number;
  systemPrompt: string;
  /** Guardrail mode: 'deny' = auto-deny dangerous actions, 'interactive' = HITL prompt */
  guardrailMode?: 'deny' | 'interactive';
}

/**
 * Result of running the agent loop.
 */
export interface AgentLoopResult {
  turns: number;
  finalOutput: string;
  stoppedBecause: string;
  messages: Message[];
  auditEntries: GuardrailDecision[];
}

/**
 * Agent main loop — the core of the harness.
 *
 * Flow:
 * 1. Build context (system prompt + user task)
 * 2. Call LLM → parse actions
 * 3. For each tool call: check guardrail → (HITL if interactive) → execute → build feedback
 * 4. Check stop judge
 * 5. Loop until stop
 *
 * Corresponds to SPEC §3.3.
 */
export class AgentLoop {
  private config: AgentLoopConfig;
  private llm: LLMProvider;
  private registry: ToolRegistry;
  private hitl: HITLStateMachine | null;
  private onHITLPause: ((event: HITLEvent) => void) | null;

  constructor(
    config: AgentLoopConfig,
    llm: LLMProvider,
    registry: ToolRegistry,
    opts?: {
      hitl?: HITLStateMachine;
      onHITLPause?: (event: HITLEvent) => void;
    },
  ) {
    this.config = config;
    this.llm = llm;
    this.registry = registry;
    this.hitl = opts?.hitl ?? null;
    this.onHITLPause = opts?.onHITLPause ?? null;
  }

  async run(task: string): Promise<AgentLoopResult> {
    const messages: Message[] = [];
    const auditEntries: GuardrailDecision[] = [];
    const previousTextContents: string[] = [];

    // Build initial context
    messages.push({ role: 'system', content: this.config.systemPrompt });
    messages.push({ role: 'user', content: task });

    let turns = 0;
    let finalOutput = '';
    let stoppedBecause = '';

    while (true) {
      turns++;

      // Call LLM
      const response = await this.llm.complete(messages);

      // Parse actions
      const actions = parseActions(response);

      // Append assistant message
      const assistantMsg: Message = {
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      };
      messages.push(assistantMsg);

      let hasToolCalls = false;

      // Execute tool calls
      for (const action of actions) {
        if (action.type === 'tool_call' && action.toolCall) {
          hasToolCalls = true;

          // Check guardrail
          const decision = checkAction(action);
          auditEntries.push(decision);

          if (!decision.allowed) {
            if (this.config.guardrailMode === 'interactive' && this.hitl) {
              // Interactive mode: pause and wait for user decision
              try {
                const event = this.hitl.pause(action, decision);

                // Notify CLI to display prompt
                if (this.onHITLPause) {
                  this.onHITLPause(event);
                }

                // Wait for user resolution
                const userDecision = await this.hitl.waitForResolution();

                if (userDecision.action === 'allow') {
                  // Execute with potentially modified command
                  if (userDecision.modifiedCommand && action.toolCall.name === 'shell_exec') {
                    action.toolCall.arguments = {
                      ...action.toolCall.arguments,
                      command: userDecision.modifiedCommand,
                    };
                  }
                  // Fall through to execution below
                } else {
                  // Deny: add blocked message and skip
                  messages.push({
                    role: 'tool',
                    content: `[BLOCKED by user] ${decision.reason}`,
                    toolCallId: action.toolCall.id,
                    name: action.toolCall.name,
                  });
                  continue;
                }
              } catch (err) {
                if (err instanceof SessionTerminatedError) {
                  finalOutput = err.message;
                  stoppedBecause = 'session_terminated';
                  return { turns, finalOutput, stoppedBecause, messages, auditEntries };
                }
                throw err;
              }
            } else {
              // Auto-deny mode: block and continue
              messages.push({
                role: 'tool',
                content: `[BLOCKED] ${decision.reason}`,
                toolCallId: action.toolCall.id,
                name: action.toolCall.name,
              });
              continue;
            }
          }

          // Execute tool
          if (this.registry.has(action.toolCall.name)) {
            const result = await this.registry.execute(action.toolCall.name, action.toolCall.arguments);

            // Build feedback
            const feedbackContent = this.buildFeedback(result, action.toolCall, turns);

            messages.push({
              role: 'tool',
              content: feedbackContent,
              toolCallId: action.toolCall.id,
              name: action.toolCall.name,
            });
          } else {
            messages.push({
              role: 'tool',
              content: `Tool "${action.toolCall.name}" not found.`,
              toolCallId: action.toolCall.id,
              name: action.toolCall.name,
            });
          }
        }
      }

      // Check stop condition
      const stopDecision = shouldStop({
        currentTurn: turns,
        maxTurns: this.config.maxTurns,
        hasToolCalls,
        textContent: response.content,
        previousTextContents: [...previousTextContents],
      });

      if (!hasToolCalls) {
        previousTextContents.push(response.content);
      }

      if (stopDecision.shouldStop) {
        finalOutput = response.content;
        stoppedBecause = stopDecision.reason ?? 'task_complete';
        break;
      }
    }

    return { turns, finalOutput, stoppedBecause, messages, auditEntries };
  }

  /**
   * Build a structured feedback string from a tool execution result.
   * Covers test runners, lint runners, and shell exec outputs.
   */
  private buildFeedback(result: ToolResult, toolCall: ToolCall, turnNumber: number): string {
    const parts: string[] = [];

    // Basic result
    parts.push(JSON.stringify(result.data));

    // Determine output text from result data
    const data = result.data as { stdout?: string; stderr?: string; command?: string; exitCode?: number } | undefined;
    const output = [data?.stdout ?? '', data?.stderr ?? ''].join('\n');

    const checks: FeedbackCheck[] = [];

    if (toolCall.name === 'run_tests') {
      const testResult = parseTestResult(output);
      checks.push({
        type: 'test',
        status: testResult.status,
        details: `${testResult.passed}/${testResult.passed + testResult.failed} passed`,
      });

      const lintResult = parseLintResult(output);
      if (lintResult.issues.length > 0) {
        checks.push({
          type: 'lint',
          status: lintResult.status,
          details: `${lintResult.errors} errors, ${lintResult.warnings} warnings`,
        });
      }

      const classifications = classifyFailures(testResult, lintResult.issues.length > 0 ? lintResult : null);
      const report = formatFeedbackReport(turnNumber, checks, classifications);
      parts.push('\n' + report);
    } else if (toolCall.name === 'run_lint') {
      const lintResult = parseLintResult(output);
      checks.push({
        type: 'lint',
        status: lintResult.status,
        details: `${lintResult.errors} errors, ${lintResult.warnings} warnings`,
      });

      const classifications = classifyFailures(
        { status: 'pass', passed: 0, failed: 0, failures: [], failureDetails: [] },
        lintResult,
      );
      const report = formatFeedbackReport(turnNumber, checks, classifications);
      parts.push('\n' + report);
    } else if (toolCall.name === 'shell_exec') {
      // Provide structured feedback for shell commands
      if (!result.success || data?.stderr) {
        checks.push({
          type: 'exitcode',
          status: result.success ? 'warn' : 'fail',
          details: result.success
            ? 'Command completed with stderr output'
            : `Command failed with exit code ${data?.exitCode ?? 'unknown'}`,
        });
      }

      if (checks.length > 0) {
        const classifications = classifyFailures(
          { status: result.success ? 'pass' : 'fail', passed: 0, failed: result.success ? 0 : 1, failures: [], failureDetails: [] },
          null,
        );
        const report = formatFeedbackReport(turnNumber, checks, classifications);
        parts.push('\n' + report);
      }
    }

    if (result.error) {
      parts.push(`Error: ${result.error}`);
    }

    return parts.join('\n');
  }
}
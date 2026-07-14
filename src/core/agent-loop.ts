import type { LLMProvider, Message, ToolCall } from '../core/llm/types.js';
import { parseActions } from '../core/action-parser.js';
import { shouldStop } from '../core/stop-judge.js';
import { checkAction } from '../governance/guardrail.js';
import type { GuardrailDecision } from '../governance/guardrail.js';
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
 * 3. For each tool call: check guardrail → execute → build feedback
 * 4. Check stop judge
 * 5. Loop until stop
 *
 * Corresponds to SPEC §3.3.
 */
export class AgentLoop {
  private config: AgentLoopConfig;
  private llm: LLMProvider;
  private registry: ToolRegistry;

  constructor(config: AgentLoopConfig, llm: LLMProvider, registry: ToolRegistry) {
    this.config = config;
    this.llm = llm;
    this.registry = registry;
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
            if (this.config.guardrailMode === 'deny') {
              // Auto-deny: append feedback and continue
              messages.push({
                role: 'tool',
                content: `[BLOCKED] ${decision.reason}`,
                toolCallId: action.toolCall.id,
                name: action.toolCall.name,
              });
              continue;
            }
            // In interactive mode, we'd pause here — for now, auto-deny
            messages.push({
              role: 'tool',
              content: `[BLOCKED] ${decision.reason}`,
              toolCallId: action.toolCall.id,
              name: action.toolCall.name,
            });
            continue;
          }

          // Execute tool
          if (this.registry.has(action.toolCall.name)) {
            const result = await this.registry.execute(action.toolCall.name, action.toolCall.arguments);

            // Build feedback
            const feedbackContent = this.buildFeedback(result, action.toolCall);

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
   * Build a feedback string from a tool execution result.
   */
  private buildFeedback(result: ToolResult, toolCall: ToolCall): string {
    const parts: string[] = [];

    // Basic result
    parts.push(JSON.stringify(result.data));

    // Parse test results
    if (toolCall.name === 'run_tests' && result.data) {
      const data = result.data as { stdout?: string; stderr?: string };
      const output = [data.stdout ?? '', data.stderr ?? ''].join('\n');
      const testResult = parseTestResult(output);
      const lintResult = parseLintResult(output);

      const checks: FeedbackCheck[] = [
        {
          type: 'test',
          status: testResult.status,
          details: `${testResult.passed}/${testResult.passed + testResult.failed} passed`,
        },
      ];

      if (lintResult.issues.length > 0) {
        checks.push({
          type: 'lint',
          status: lintResult.status,
          details: `${lintResult.errors} errors, ${lintResult.warnings} warnings`,
        });
      }

      const classifications = classifyFailures(testResult, lintResult.issues.length > 0 ? lintResult : null);
      const report = formatFeedbackReport(0, checks, classifications); // turn number is managed by loop

      parts.push('\n' + report);
    }

    if (result.error) {
      parts.push(`Error: ${result.error}`);
    }

    return parts.join('\n');
  }
}
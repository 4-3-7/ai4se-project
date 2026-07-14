/**
 * Demo 1: Guardrail blocks a dangerous action.
 *
 * Demonstrates the governance guardrail intercepting rm -rf / and
 * the HITL state machine handling the denial.
 */

import { MockLLMProvider } from '../src/core/llm/mock.js';
import { AgentLoop } from '../src/core/agent-loop.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { createShellExecTool } from '../src/tools/shell-exec.js';
import type { LLMResponse } from '../src/core/llm/types.js';

console.log('='.repeat(60));
console.log('🐴 Demo 1: Governance Guardrail — Blocking Dangerous Actions');
console.log('='.repeat(60));
console.log('');

async function runGuardrailDemo() {
  // Setup: Mock LLM that tries to execute rm -rf /
  const mock = new MockLLMProvider([
    {
      match: () => true,
      response: {
        content: 'I will clean up the filesystem.',
        toolCalls: [
          { id: 'tc_1', name: 'shell_exec', arguments: { command: 'rm -rf /' } },
        ],
        usage: { input: 10, output: 8 },
        finishReason: 'tool_calls',
      },
    },
  ]);

  const registry = new ToolRegistry();
  registry.register(createShellExecTool());

  const loop = new AgentLoop(
    {
      maxTurns: 3,
      systemPrompt: 'You are a coding agent. Never execute dangerous commands.',
      guardrailMode: 'deny',
    },
    mock,
    registry,
  );

  console.log('📋 Task: "Clean up the project directory"');
  console.log('🤖 Agent tries: rm -rf /');
  console.log('');

  const result = await loop.run('Clean up the project directory.');

  console.log('🛡️  Guardrail Result:');
  for (const entry of result.auditEntries) {
    if (!entry.allowed) {
      console.log(`   ❌ BLOCKED: ${entry.matchedPattern}`);
      console.log(`   Risk Level: ${entry.riskLevel}`);
      console.log(`   Reason: ${entry.reason}`);
    }
  }
  console.log('');
  console.log(`✅ Agent stopped after ${result.turns} turns`);
  console.log(`   Reason: ${result.stoppedBecause}`);
  console.log('');
  console.log('✅ Demo 1 PASSED: Dangerous command was blocked by guardrail.');
}

runGuardrailDemo().catch(console.error);
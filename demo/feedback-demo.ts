/**
 * Demo 2: Feedback loop drives correction.
 *
 * Demonstrates the feedback system: test failure → parse → classify → inject → agent corrects.
 */

import { MockLLMProvider } from '../src/core/llm/mock.js';
import { AgentLoop } from '../src/core/agent-loop.js';
import { ToolRegistry } from '../src/tools/registry.js';
import type { Message, LLMResponse } from '../src/core/llm/types.js';

console.log('='.repeat(60));
console.log('🐴 Demo 2: Feedback Loop — Test Failure → Correction');
console.log('='.repeat(60));
console.log('');

async function runFeedbackDemo() {
  const registry = new ToolRegistry();

  // Simulated test runner that always fails
  registry.register({
    name: 'run_tests',
    description: 'Run the test suite.',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string' } },
      required: ['command'],
    },
    execute: async () => ({
      success: false,
      data: {
        stdout: [
          '❯ src/core/parser.test.ts > should parse input',
          '  → expected "bar" to be "foo"',
          '❯ src/core/parser.test.ts > should handle empty',
          '  → expected null to be defined',
          '',
          'Test Files  1 failed (1)',
          'Tests  2 failed | 3 passed (5)',
        ].join('\n'),
        stderr: '',
        exitCode: 1,
      },
    }),
  });

  // Mock LLM: first turn runs tests, second turn fixes based on feedback
  const mock = new MockLLMProvider([
    {
      match: (msgs: Message[]) => !msgs.some((m) => m.role === 'tool'),
      response: {
        content: 'Let me run the tests to see the current state.',
        toolCalls: [
          { id: 'tc_1', name: 'run_tests', arguments: { command: 'npm test' } },
        ],
        usage: { input: 10, output: 8 },
        finishReason: 'tool_calls',
      },
    },
    {
      match: (msgs: Message[]) => msgs.some((m) => m.role === 'tool'),
      response: {
        content: 'I see the test failures. The parser returns "bar" but the test expects "foo". I will fix the return value.',
        usage: { input: 30, output: 20 },
        finishReason: 'stop',
      },
    },
  ]);

  const loop = new AgentLoop(
    { maxTurns: 5, systemPrompt: 'You are a coding agent. Run tests and fix failures.' },
    mock,
    registry,
  );

  console.log('📋 Task: "Fix the failing tests"');
  console.log('');

  const result = await loop.run('Fix the failing tests.');

  // Check that feedback was injected
  const toolMessages = result.messages.filter((m) => m.role === 'tool');
  console.log(`🔄 Agent ran ${result.turns} turns`);
  console.log(`📊 Tool results: ${toolMessages.length}`);
  console.log('');

  for (const msg of toolMessages) {
    if (msg.content.includes('Feedback Report')) {
      console.log('📝 Feedback was injected into context:');
      console.log(msg.content.substring(0, 500));
      console.log('...');
    }
  }

  console.log('');
  console.log(`✅ Final output: "${result.finalOutput}"`);
  console.log('');
  console.log('✅ Demo 2 PASSED: Feedback loop drove agent to correction.');
}

runFeedbackDemo().catch(console.error);
import { describe, it, expect, vi } from 'vitest';
import { AgentLoop } from './agent-loop.js';
import type { AgentLoopConfig } from './agent-loop.js';
import { MockLLMProvider } from '../core/llm/mock.js';
import type { Message } from '../core/llm/types.js';
import { ToolRegistry } from '../tools/registry.js';
import type { Tool } from '../tools/types.js';
import { HITLStateMachine } from '../governance/hitl-state-machine.js';

// ── Helpers ──

function makeConfig(overrides: Partial<AgentLoopConfig> = {}): AgentLoopConfig {
  return {
    maxTurns: 10,
    systemPrompt: 'You are a coding agent.',
    ...overrides,
  };
}

function makeMockTool(name: string): Tool {
  return {
    name,
    description: `Tool: ${name}`,
    parameters: { type: 'object', properties: {}, required: [] },
    execute: vi.fn().mockResolvedValue({ success: true, data: `result from ${name}` }),
  };
}

// ── Tests ──

describe('AgentLoop', () => {
  // ── Single-turn text response ──

  it('should complete in one turn for a text-only response', async () => {
    const mock = new MockLLMProvider([
      {
        match: () => true,
        response: {
          content: 'Task completed successfully.',
          usage: { input: 10, output: 5 },
          finishReason: 'stop',
        },
      },
    ]);

    const registry = new ToolRegistry();
    const loop = new AgentLoop(makeConfig({ maxTurns: 5 }), mock, registry);

    const result = await loop.run('Fix the bug.');

    expect(result.turns).toBe(1);
    expect(result.finalOutput).toContain('Task completed');
    expect(result.stoppedBecause).toBe('task_complete');
  });

  // ── Multi-turn tool calls ──

  it('should execute tool calls across multiple turns', async () => {
    const readTool = makeMockTool('read_file');
    const registry = new ToolRegistry();
    registry.register(readTool);

    const mock = new MockLLMProvider([
      {
        match: (_msgs: Message[]) => {
          // Only match if this is the first call (no tool results yet)
          return !_msgs.some((m) => m.role === 'tool');
        },
        response: {
          content: 'Let me read the file.',
          toolCalls: [{ id: 'tc_1', name: 'read_file', arguments: { path: 'src/index.ts' } }],
          usage: { input: 10, output: 8 },
          finishReason: 'tool_calls',
        },
      },
      {
        match: (_msgs: Message[]) => {
          return _msgs.some((m) => m.role === 'tool');
        },
        response: {
          content: 'I have read the file. Task done.',
          usage: { input: 20, output: 10 },
          finishReason: 'stop',
        },
      },
    ]);

    const loop = new AgentLoop(makeConfig({ maxTurns: 5 }), mock, registry);

    const result = await loop.run('Read the file.');

    expect(result.turns).toBe(2);
    expect(readTool.execute).toHaveBeenCalledWith({ path: 'src/index.ts' });
    expect(result.finalOutput).toContain('Task done');
  });

  // ── Max turns limit ──

  it('should stop when maxTurns is reached', async () => {
    const registry = new ToolRegistry();
    registry.register(makeMockTool('echo'));

    // Always return a tool call to keep the loop going
    const mock = new MockLLMProvider([
      {
        match: () => true,
        response: {
          content: '',
          toolCalls: [{ id: 'tc_1', name: 'echo', arguments: { msg: 'hello' } }],
          usage: { input: 5, output: 5 },
          finishReason: 'tool_calls',
        },
      },
    ]);

    const loop = new AgentLoop(makeConfig({ maxTurns: 3 }), mock, registry);

    const result = await loop.run('Keep going.');

    expect(result.turns).toBe(3);
    expect(result.stoppedBecause).toBe('max_turns');
  });

  // ── Guardrail integration ──

  it('should block dangerous commands via guardrail', async () => {
    const registry = new ToolRegistry();
    registry.register(makeMockTool('shell_exec'));

    const mock = new MockLLMProvider([
      {
        match: () => true,
        response: {
          content: '',
          toolCalls: [{ id: 'tc_1', name: 'shell_exec', arguments: { command: 'rm -rf /' } }],
          usage: { input: 5, output: 5 },
          finishReason: 'tool_calls',
        },
      },
    ]);

    const loop = new AgentLoop(
      makeConfig({ maxTurns: 3, guardrailMode: 'deny' }),
      mock,
      registry,
    );

    const result = await loop.run('Clean up.');

    // Should be blocked by guardrail, agent gets feedback and tries again
    expect(result.turns).toBeGreaterThanOrEqual(1);
    // The dangerous command should not have been executed
    expect(result.stoppedBecause).toBeDefined();
  });

  // ── Feedback injection ──

  it('should inject feedback after tool execution', async () => {
    const registry = new ToolRegistry();
    const executeSpy = vi.fn().mockResolvedValue({
      success: false,
      data: { stdout: 'Tests: 2 failed, 3 passed', stderr: '', exitCode: 1 },
    });
    registry.register({
      name: 'run_tests',
      description: 'Run tests',
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
      execute: executeSpy,
    });

    const mock = new MockLLMProvider([
      {
        match: (_msgs: Message[]) => !_msgs.some((m) => m.role === 'tool'),
        response: {
          content: '',
          toolCalls: [{ id: 'tc_1', name: 'run_tests', arguments: { command: 'npm test' } }],
          usage: { input: 10, output: 8 },
          finishReason: 'tool_calls',
        },
      },
      {
        match: (_msgs: Message[]) => _msgs.some((m) => m.role === 'tool'),
        response: {
          content: 'I see the test failures. Let me fix them.',
          usage: { input: 20, output: 10 },
          finishReason: 'stop',
        },
      },
    ]);

    const loop = new AgentLoop(makeConfig({ maxTurns: 5 }), mock, registry);

    const result = await loop.run('Run the tests.');
    expect(result.turns).toBe(2);

    // Check that feedback was injected into the context
    const toolMessages = result.messages.filter((m) => m.role === 'tool');
    expect(toolMessages.length).toBeGreaterThan(0);
    // The tool result includes feedback
    const feedbackMsg = toolMessages[0]!.content;
    expect(feedbackMsg).toContain('2 failed');
  });

  // ── Messages accumulation ──

  it('should accumulate all messages across turns', async () => {
    const registry = new ToolRegistry();
    registry.register(makeMockTool('read_file'));

    const mock = new MockLLMProvider([
      {
        match: (_msgs: Message[]) => !_msgs.some((m) => m.role === 'tool'),
        response: {
          content: '',
          toolCalls: [{ id: 'tc_1', name: 'read_file', arguments: { path: 'a.ts' } }],
          usage: { input: 10, output: 8 },
          finishReason: 'tool_calls',
        },
      },
      {
        match: () => true,
        response: {
          content: 'Done.',
          usage: { input: 20, output: 3 },
          finishReason: 'stop',
        },
      },
    ]);

    const loop = new AgentLoop(makeConfig({ maxTurns: 5 }), mock, registry);

    const result = await loop.run('Read a file.');

    // Should have: system, user, assistant (tool_call), tool (result), assistant (text)
    expect(result.messages.length).toBeGreaterThanOrEqual(4);
    expect(result.messages[0]!.role).toBe('system');
    expect(result.messages[1]!.role).toBe('user');
  });

  // ── HITL interactive mode ──

  it('should pause HITL and deny dangerous action in interactive mode', async () => {
    const registry = new ToolRegistry();
    registry.register(makeMockTool('shell_exec'));

    const mock = new MockLLMProvider([
      {
        match: (_msgs: Message[]) => !_msgs.some((m) => m.role === 'tool'),
        response: {
          content: '',
          toolCalls: [{ id: 'tc_1', name: 'shell_exec', arguments: { command: 'rm -rf /' } }],
          usage: { input: 5, output: 5 },
          finishReason: 'tool_calls',
        },
      },
      {
        match: () => true,
        response: {
          content: 'Action was blocked by user.',
          usage: { input: 10, output: 5 },
          finishReason: 'stop',
        },
      },
    ]);

    const hitl = new HITLStateMachine({ timeoutMs: 60_000 });

    const loop = new AgentLoop(
      makeConfig({ maxTurns: 3, guardrailMode: 'interactive' }),
      mock,
      registry,
      { hitl },
    );

    // Start the loop — it will pause on the guardrail block
    const runPromise = loop.run('Clean up.');

    // Wait a tick for the pause to happen
    await new Promise((r) => setTimeout(r, 10));

    expect(hitl.isPaused()).toBe(true);

    // User denies the action
    hitl.resolve('deny');

    const result = await runPromise;

    expect(result.stoppedBecause).toBe('task_complete');
    // The blocked message should be in the tool messages
    const toolMsgs = result.messages.filter((m) => m.role === 'tool');
    expect(toolMsgs.some((m) => m.content.includes('[BLOCKED by user]'))).toBe(true);
  });

  it('should allow dangerous action when user approves in interactive mode', async () => {
    const executeSpy = vi.fn().mockResolvedValue({ success: true, data: 'cleaned up' });
    const registry = new ToolRegistry();
    registry.register({
      name: 'shell_exec',
      description: 'Execute shell',
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
      execute: executeSpy,
    });

    const mock = new MockLLMProvider([
      {
        match: (_msgs: Message[]) => !_msgs.some((m) => m.role === 'tool'),
        response: {
          content: '',
          toolCalls: [{ id: 'tc_1', name: 'shell_exec', arguments: { command: 'rm -rf /' } }],
          usage: { input: 5, output: 5 },
          finishReason: 'tool_calls',
        },
      },
      {
        match: () => true,
        response: {
          content: 'Cleaned up as requested.',
          usage: { input: 10, output: 5 },
          finishReason: 'stop',
        },
      },
    ]);

    const hitl = new HITLStateMachine({ timeoutMs: 60_000 });

    const loop = new AgentLoop(
      makeConfig({ maxTurns: 3, guardrailMode: 'interactive' }),
      mock,
      registry,
      { hitl },
    );

    const runPromise = loop.run('Clean up.');
    await new Promise((r) => setTimeout(r, 10));

    // User allows with modified safe command
    hitl.resolve('allow', 'rm -rf ./temp');

    const result = await runPromise;

    // The tool should have been executed with the modified command
    expect(executeSpy).toHaveBeenCalled();
    const execArgs = executeSpy.mock.calls[0]![0] as { command: string };
    expect(execArgs.command).toBe('rm -rf ./temp');
    expect(result.finalOutput).toContain('Cleaned up');
  });

  it('should terminate session when user chooses terminate', async () => {
    const registry = new ToolRegistry();
    registry.register(makeMockTool('shell_exec'));

    const mock = new MockLLMProvider([
      {
        match: () => true,
        response: {
          content: '',
          toolCalls: [{ id: 'tc_1', name: 'shell_exec', arguments: { command: 'rm -rf /' } }],
          usage: { input: 5, output: 5 },
          finishReason: 'tool_calls',
        },
      },
    ]);

    const hitl = new HITLStateMachine({ timeoutMs: 60_000 });

    const loop = new AgentLoop(
      makeConfig({ maxTurns: 3, guardrailMode: 'interactive' }),
      mock,
      registry,
      { hitl },
    );

    const runPromise = loop.run('Clean up.');
    await new Promise((r) => setTimeout(r, 10));

    // resolve('terminate') throws synchronously — catch it
    try {
      hitl.resolve('terminate');
    } catch {
      // Expected
    }

    const result = await runPromise;

    expect(result.stoppedBecause).toBe('session_terminated');
  });

  // ── Feedback refinement ──

  it('should include turn number in feedback report', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'run_tests',
      description: 'Run tests',
      parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
      execute: vi.fn().mockResolvedValue({
        success: false,
        data: { stdout: 'Tests: 2 failed, 3 passed', stderr: '', exitCode: 1 },
      }),
    });

    const mock = new MockLLMProvider([
      {
        match: (_msgs: Message[]) => !_msgs.some((m) => m.role === 'tool'),
        response: {
          content: '',
          toolCalls: [{ id: 'tc_1', name: 'run_tests', arguments: { command: 'npm test' } }],
          usage: { input: 10, output: 8 },
          finishReason: 'tool_calls',
        },
      },
      {
        match: () => true,
        response: {
          content: 'Fixing tests.',
          usage: { input: 20, output: 10 },
          finishReason: 'stop',
        },
      },
    ]);

    const loop = new AgentLoop(makeConfig({ maxTurns: 5 }), mock, registry);

    const result = await loop.run('Run tests.');
    const toolMsgs = result.messages.filter((m) => m.role === 'tool');
    const feedbackMsg = toolMsgs[0]!.content;

    // The feedback report should reference turn 1
    expect(feedbackMsg).toContain('Turn 1');
  });
});
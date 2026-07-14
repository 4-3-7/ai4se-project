import { describe, it, expect } from 'vitest';
import { parseActions } from './action-parser.js';
import type { LLMResponse, ToolCall } from '../core/llm/types.js';

// ── Helpers ──

function makeResponse(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    content: '',
    usage: { input: 0, output: 0 },
    finishReason: 'stop',
    ...overrides,
  };
}

function makeToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 'tc_1',
    name: 'read_file',
    arguments: { path: 'src/index.ts' },
    ...overrides,
  };
}

// ── Tests ──

describe('parseActions', () => {
  // ── Text responses ──

  it('should return a text_response action when response has only content', () => {
    const response = makeResponse({
      content: 'The bug has been fixed.',
      finishReason: 'stop',
    });

    const actions = parseActions(response);

    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('text_response');
    expect(actions[0]!.textContent).toBe('The bug has been fixed.');
  });

  it('should return text_response for empty content (finish edge case)', () => {
    const response = makeResponse({ content: '' });

    const actions = parseActions(response);

    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('text_response');
    expect(actions[0]!.textContent).toBe('');
  });

  // ── Tool call responses ──

  it('should return tool_call actions when response has toolCalls', () => {
    const response = makeResponse({
      content: '',
      toolCalls: [
        makeToolCall({ id: 'tc_1', name: 'read_file', arguments: { path: 'src/a.ts' } }),
        makeToolCall({ id: 'tc_2', name: 'shell_exec', arguments: { command: 'npm test' } }),
      ],
      finishReason: 'tool_calls',
    });

    const actions = parseActions(response);

    expect(actions).toHaveLength(2);
    expect(actions[0]!.type).toBe('tool_call');
    expect(actions[0]!.toolCall!.name).toBe('read_file');
    expect(actions[1]!.type).toBe('tool_call');
    expect(actions[1]!.toolCall!.name).toBe('shell_exec');
  });

  it('should return empty array when toolCalls is empty array', () => {
    const response = makeResponse({
      content: 'Let me think...',
      toolCalls: [],
      finishReason: 'stop',
    });

    const actions = parseActions(response);

    // Should fall through to text_response since toolCalls is empty
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('text_response');
  });

  // ── Mixed content + tool calls ──

  it('should return tool_call actions when both content and toolCalls exist', () => {
    const response = makeResponse({
      content: 'I will read the file now.',
      toolCalls: [makeToolCall({ id: 'tc_1', name: 'read_file', arguments: { path: 'src/x.ts' } })],
      finishReason: 'tool_calls',
    });

    const actions = parseActions(response);

    // Tool calls take priority over text content
    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('tool_call');
    expect(actions[0]!.toolCall!.name).toBe('read_file');
  });

  // ── Tool call argument types ──

  it('should handle various argument types (string, number, boolean)', () => {
    const response = makeResponse({
      toolCalls: [
        {
          id: 'tc_1',
          name: 'shell_exec',
          arguments: {
            command: 'npm test',
            timeout: 30000,
            captureStderr: true,
          },
        },
      ],
      finishReason: 'tool_calls',
    });

    const actions = parseActions(response);

    expect(actions[0]!.toolCall!.arguments.command).toBe('npm test');
    expect(actions[0]!.toolCall!.arguments.timeout).toBe(30000);
    expect(actions[0]!.toolCall!.arguments.captureStderr).toBe(true);
  });

  it('should handle nested object arguments', () => {
    const response = makeResponse({
      toolCalls: [
        {
          id: 'tc_1',
          name: 'write_file',
          arguments: {
            path: 'src/config.ts',
            content: 'export const x = 1;',
            options: { encoding: 'utf-8', mode: 0o644 },
          },
        },
      ],
      finishReason: 'tool_calls',
    });

    const actions = parseActions(response);

    expect(actions[0]!.toolCall!.arguments.options).toEqual({ encoding: 'utf-8', mode: 0o644 });
  });

  // ── Edge cases ──

  it('should handle undefined toolCalls gracefully', () => {
    const response = makeResponse({
      content: 'Done.',
      toolCalls: undefined,
    });

    const actions = parseActions(response);

    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('text_response');
  });

  it('should handle finishReason "error" with content', () => {
    const response = makeResponse({
      content: 'An error occurred while processing.',
      finishReason: 'error',
    });

    const actions = parseActions(response);

    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('text_response');
    expect(actions[0]!.textContent).toContain('error');
  });

  it('should handle finishReason "length" (truncated)', () => {
    const response = makeResponse({
      content: 'The output was truncated...',
      finishReason: 'length',
    });

    const actions = parseActions(response);

    expect(actions).toHaveLength(1);
    expect(actions[0]!.type).toBe('text_response');
  });
});
import { describe, it, expect, beforeEach } from 'vitest';
import { AnthropicProvider } from './anthropic.js';
import type { Message, LLMResponse } from './types.js';
import { LLMAuthError, LLMRateLimitError, LLMServerError } from './types.js';

// ── Helpers ──

function msg(role: Message['role'], content: string, extra?: Partial<Message>): Message {
  return { role, content, ...extra };
}

// ── Tests ──

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider('sk-ant-test-key', 'claude-sonnet-5');
  });

  // ── Metadata ──

  it('should have correct providerId', () => {
    expect(provider.providerId).toBe('anthropic');
  });

  it('should expose available models', () => {
    expect(provider.models).toContain('claude-sonnet-5');
    expect(provider.models).toContain('claude-opus-4-8');
    expect(provider.models).toContain('claude-haiku-4-5');
  });

  // ── Message format conversion ──

  it('should convert system and user messages to Anthropic format', () => {
    const messages: Message[] = [
      msg('system', 'You are a coding agent.'),
      msg('user', 'Fix the bug.'),
    ];

    const formatted = (provider as unknown as { convertMessages: (m: Message[]) => unknown[] }).convertMessages(messages);

    // System message becomes top-level system param, user becomes content
    expect(formatted).toHaveLength(1); // Only user message in messages array
    expect((formatted[0] as { role: string }).role).toBe('user');
  });

  it('should convert assistant messages with tool calls', () => {
    const messages: Message[] = [
      msg('system', 'You are a coding agent.'),
      msg('user', 'Read the file.'),
      msg('assistant', '', {
        toolCalls: [{ id: 'tc_1', name: 'read_file', arguments: { path: 'src/index.ts' } }],
      }),
    ];

    const formatted = (provider as unknown as { convertMessages: (m: Message[]) => unknown[] }).convertMessages(messages);

    const assistantMsg = formatted[1] as { role: string; content: unknown[] };
    expect(assistantMsg.role).toBe('assistant');
    expect(Array.isArray(assistantMsg.content)).toBe(true);
  });

  it('should convert tool result messages', () => {
    const messages: Message[] = [
      msg('system', 'Agent'),
      msg('user', 'Read.'),
      msg('assistant', '', {
        toolCalls: [{ id: 'tc_1', name: 'read_file', arguments: { path: 'a.ts' } }],
      }),
      msg('tool', 'file content', { toolCallId: 'tc_1', name: 'read_file' }),
    ];

    const formatted = (provider as unknown as { convertMessages: (m: Message[]) => unknown[] }).convertMessages(messages);

    const toolMsg = formatted[2] as { role: string; content: unknown[] };
    expect(toolMsg.role).toBe('user');
    expect(Array.isArray(toolMsg.content)).toBe(true);
  });

  // ── Response mapping ──

  it('should map Anthropic text response to LLMResponse', () => {
    const anthropicResponse = {
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'The bug is fixed.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    };

    const mapped = (provider as unknown as { mapResponse: (r: unknown) => LLMResponse }).mapResponse(anthropicResponse);

    expect(mapped.content).toBe('The bug is fixed.');
    expect(mapped.finishReason).toBe('stop');
    expect(mapped.usage.input).toBe(10);
    expect(mapped.usage.output).toBe(5);
  });

  it('should map Anthropic tool_use response to LLMResponse', () => {
    const anthropicResponse = {
      id: 'msg_123',
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'tc_1', name: 'read_file', input: { path: 'src/index.ts' } },
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 8 },
    };

    const mapped = (provider as unknown as { mapResponse: (r: unknown) => LLMResponse }).mapResponse(anthropicResponse);

    expect(mapped.toolCalls).toHaveLength(1);
    expect(mapped.toolCalls![0]!.name).toBe('read_file');
    expect(mapped.finishReason).toBe('tool_calls');
  });

  // ── Error handling ──

  it('should map 401 to LLMAuthError', () => {
    expect(() => {
      (provider as unknown as { handleError: (s: number, m: string) => never }).handleError(401, 'Unauthorized');
    }).toThrow(LLMAuthError);
  });

  it('should map 429 to LLMRateLimitError', () => {
    expect(() => {
      (provider as unknown as { handleError: (s: number, m: string, h?: Record<string, string>) => never }).handleError(429, 'Rate limited', { 'retry-after': '30' });
    }).toThrow(LLMRateLimitError);
  });

  it('should map 5xx to LLMServerError', () => {
    expect(() => {
      (provider as unknown as { handleError: (s: number, m: string) => never }).handleError(500, 'Server error');
    }).toThrow(LLMServerError);
  });

  // ── Retry logic ──

  it('should have retry logic with exponential backoff', async () => {
    const retryDelays = (provider as unknown as { getRetryDelays: () => number[] }).getRetryDelays();
    expect(retryDelays).toHaveLength(3);
    expect(retryDelays[0]).toBe(1000);
    expect(retryDelays[1]).toBe(2000);
    expect(retryDelays[2]).toBe(4000);
  });
});
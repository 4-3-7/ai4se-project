import { describe, it, expect, beforeEach } from 'vitest';
import { OpenAIProvider } from './openai.js';
import type { Message, LLMResponse } from './types.js';
import { LLMAuthError, LLMRateLimitError, LLMServerError } from './types.js';

// ── Helpers ──

function msg(role: Message['role'], content: string, extra?: Partial<Message>): Message {
  return { role, content, ...extra };
}

// ── Tests ──

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider('sk-proj-test-key', 'gpt-5');
  });

  // ── Metadata ──

  it('should have correct providerId', () => {
    expect(provider.providerId).toBe('openai');
  });

  it('should expose available models', () => {
    expect(provider.models).toContain('gpt-5');
    expect(provider.models).toContain('gpt-5-mini');
    expect(provider.models).toContain('gpt-5-nano');
  });

  // ── Message format conversion ──

  it('should convert system and user messages to OpenAI format', () => {
    const messages: Message[] = [
      msg('system', 'You are a coding agent.'),
      msg('user', 'Fix the bug.'),
    ];

    const formatted = (provider as unknown as { convertMessages: (m: Message[]) => unknown[] }).convertMessages(messages);

    expect(formatted).toHaveLength(2);
    expect((formatted[0] as { role: string }).role).toBe('system');
    expect((formatted[1] as { role: string }).role).toBe('user');
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

    const assistantMsg = formatted[2] as { role: string; tool_calls?: unknown[] };
    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.tool_calls).toBeDefined();
    expect(assistantMsg.tool_calls).toHaveLength(1);
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

    const toolMsg = formatted[3] as { role: string; tool_call_id: string; content: string };
    expect(toolMsg.role).toBe('tool');
    expect(toolMsg.tool_call_id).toBe('tc_1');
    expect(toolMsg.content).toBe('file content');
  });

  // ── Response mapping ──

  it('should map OpenAI text response to LLMResponse', () => {
    const openaiResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'The bug is fixed.' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    const mapped = (provider as unknown as { mapResponse: (r: unknown) => LLMResponse }).mapResponse(openaiResponse);

    expect(mapped.content).toBe('The bug is fixed.');
    expect(mapped.finishReason).toBe('stop');
    expect(mapped.usage.input).toBe(10);
    expect(mapped.usage.output).toBe(5);
  });

  it('should map OpenAI tool_calls response to LLMResponse', () => {
    const openaiResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'tc_1',
                type: 'function',
                function: { name: 'read_file', arguments: '{"path":"src/index.ts"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
    };

    const mapped = (provider as unknown as { mapResponse: (r: unknown) => LLMResponse }).mapResponse(openaiResponse);

    expect(mapped.toolCalls).toHaveLength(1);
    expect(mapped.toolCalls![0]!.name).toBe('read_file');
    expect(mapped.finishReason).toBe('tool_calls');
  });

  it('should map OpenAI response with both text and tool_calls', () => {
    const openaiResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Let me read that file.',
            tool_calls: [
              {
                id: 'tc_1',
                type: 'function',
                function: { name: 'read_file', arguments: '{"path":"src/index.ts"}' },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 },
    };

    const mapped = (provider as unknown as { mapResponse: (r: unknown) => LLMResponse }).mapResponse(openaiResponse);

    expect(mapped.content).toBe('Let me read that file.');
    expect(mapped.toolCalls).toHaveLength(1);
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
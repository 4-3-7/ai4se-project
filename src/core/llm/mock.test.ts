import { describe, it, expect } from 'vitest';
import { MockLLMProvider } from './mock.js';
import type { LLMResponse, Message, ToolCall } from './types.js';
import {
  LLMTimeoutError,
  LLMAuthError,
  LLMRateLimitError,
  LLMServerError,
} from './types.js';

// ── Helper: create a minimal message ──
function msg(role: Message['role'], content: string): Message {
  return { role, content };
}

// ── Types ──

describe('LLM types', () => {
  it('should allow creating a valid Message with system role', () => {
    const m: Message = { role: 'system', content: 'You are a helpful assistant.' };
    expect(m.role).toBe('system');
    expect(m.content).toBe('You are a helpful assistant.');
  });

  it('should allow creating a Message with tool calls', () => {
    const toolCall: ToolCall = {
      id: 'tc_1',
      name: 'read_file',
      arguments: { path: 'src/index.ts' },
    };
    const m: Message = {
      role: 'assistant',
      content: '',
      toolCalls: [toolCall],
    };
    expect(m.toolCalls).toHaveLength(1);
    expect(m.toolCalls![0]!.name).toBe('read_file');
  });

  it('should allow creating a Message with tool role', () => {
    const m: Message = {
      role: 'tool',
      content: 'file contents here...',
      name: 'read_file',
      toolCallId: 'tc_1',
    };
    expect(m.role).toBe('tool');
    expect(m.toolCallId).toBe('tc_1');
  });

  it('should define LLMResponse with all required fields', () => {
    const resp: LLMResponse = {
      content: 'Hello!',
      usage: { input: 10, output: 5 },
      finishReason: 'stop',
    };
    expect(resp.content).toBe('Hello!');
    expect(resp.usage.input).toBe(10);
    expect(resp.finishReason).toBe('stop');
  });

  it('should define LLMResponse with optional tool calls', () => {
    const resp: LLMResponse = {
      content: '',
      toolCalls: [{ id: 'tc_1', name: 'read_file', arguments: { path: 'x.ts' } }],
      usage: { input: 10, output: 5 },
      finishReason: 'tool_calls',
    };
    expect(resp.toolCalls).toHaveLength(1);
    expect(resp.finishReason).toBe('tool_calls');
  });
});

// ── Error types ──

describe('LLM error types', () => {
  it('should create LLMTimeoutError', () => {
    const err = new LLMTimeoutError('Request timed out after 120s');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('LLMTimeoutError');
    expect(err.message).toContain('timed out');
  });

  it('should create LLMAuthError', () => {
    const err = new LLMAuthError('Invalid API key');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('LLMAuthError');
  });

  it('should create LLMRateLimitError', () => {
    const err = new LLMRateLimitError('Rate limit exceeded', 30);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('LLMRateLimitError');
    expect(err.retryAfterSeconds).toBe(30);
  });

  it('should create LLMServerError', () => {
    const err = new LLMServerError('Internal server error', 500);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('LLMServerError');
    expect(err.statusCode).toBe(500);
  });
});

// ── MockLLMProvider ──

describe('MockLLMProvider', () => {
  it('should implement the LLMProvider interface', () => {
    const mock = new MockLLMProvider();
    expect(mock.providerId).toBe('mock');
    expect(Array.isArray(mock.models)).toBe(true);
    expect(typeof mock.complete).toBe('function');
  });

  it('should return a default response when no scripts match', async () => {
    const mock = new MockLLMProvider();
    const response = await mock.complete([msg('user', 'Hello')]);
    expect(response.content).toBeDefined();
    expect(response.usage).toBeDefined();
    expect(response.finishReason).toBe('stop');
  });

  it('should return deterministic responses based on scripts', async () => {
    const mock = new MockLLMProvider([
      {
        match: (messages) => messages.some((m) => m.content.includes('hello')),
        response: {
          content: 'Hi there!',
          usage: { input: 5, output: 3 },
          finishReason: 'stop',
        },
      },
    ]);

    const response = await mock.complete([msg('user', 'hello world')]);
    expect(response.content).toBe('Hi there!');
  });

  it('should return the same response for the same input (deterministic)', async () => {
    const mock = new MockLLMProvider([
      {
        match: (messages) => messages.some((m) => m.content.includes('test')),
        response: {
          content: 'Deterministic output',
          usage: { input: 3, output: 2 },
          finishReason: 'stop',
        },
      },
    ]);

    const r1 = await mock.complete([msg('user', 'test input')]);
    const r2 = await mock.complete([msg('user', 'test input')]);
    expect(r1.content).toBe(r2.content);
    expect(r1.usage.input).toBe(r2.usage.input);
  });

  it('should match scripts in order and return the first match', async () => {
    const mock = new MockLLMProvider([
      {
        match: (messages) => messages.some((m) => m.content.includes('first')),
        response: {
          content: 'First match',
          usage: { input: 1, output: 1 },
          finishReason: 'stop',
        },
      },
      {
        match: (messages) => messages.some((m) => m.content.includes('first')),
        response: {
          content: 'Second match',
          usage: { input: 1, output: 1 },
          finishReason: 'stop',
        },
      },
    ]);

    const response = await mock.complete([msg('user', 'first')]);
    expect(response.content).toBe('First match');
  });

  it('should return tool calls when script response includes them', async () => {
    const mock = new MockLLMProvider([
      {
        match: () => true,
        response: {
          content: '',
          toolCalls: [{ id: 'tc_1', name: 'read_file', arguments: { path: 'src/index.ts' } }],
          usage: { input: 5, output: 8 },
          finishReason: 'tool_calls',
        },
      },
    ]);

    const response = await mock.complete([msg('user', 'read the file')]);
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls![0]!.name).toBe('read_file');
    expect(response.finishReason).toBe('tool_calls');
  });

  it('should expose available models', () => {
    const mock = new MockLLMProvider();
    expect(mock.models).toContain('mock-model');
  });

  it('should accept custom providerId', () => {
    const mock = new MockLLMProvider([], 'custom-mock');
    expect(mock.providerId).toBe('custom-mock');
  });
});
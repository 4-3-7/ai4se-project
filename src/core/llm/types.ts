/**
 * Core type definitions for the Seahorse LLM abstraction layer.
 * Corresponds to SPEC §3.2 and §6.1.
 */

// ── Message types (§6.1) ──

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// ── LLM Provider (§3.2) ──

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  model?: string;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: { input: number; output: number };
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
}

export interface LLMProvider {
  complete(messages: Message[], options?: LLMOptions): Promise<LLMResponse>;
  readonly providerId: string;
  readonly models: string[];
}

// ── Error types (§3.2) ──

export class LLMTimeoutError extends Error {
  override name = 'LLMTimeoutError';
  constructor(message: string) {
    super(message);
  }
}

export class LLMAuthError extends Error {
  override name = 'LLMAuthError';
  constructor(message: string) {
    super(message);
  }
}

export class LLMRateLimitError extends Error {
  override name = 'LLMRateLimitError';
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class LLMServerError extends Error {
  override name = 'LLMServerError';
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

// ── Mock script types ──

export interface MockScript {
  /** Returns true if this script should handle the given messages */
  match: (messages: Message[]) => boolean;
  /** The response to return when matched */
  response: LLMResponse;
}
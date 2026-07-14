import type { LLMProvider, LLMResponse, LLMOptions, Message, ToolCall } from './types.js';
import { LLMAuthError, LLMRateLimitError, LLMServerError } from './types.js';

/**
 * OpenAI GPT provider implementation.
 * Wraps the OpenAI Chat Completions API.
 * Corresponds to SPEC §3.2.
 */
export class OpenAIProvider implements LLMProvider {
  readonly providerId = 'openai';
  readonly models = ['gpt-5', 'gpt-5-mini', 'gpt-5-nano'];

  private apiKey: string;
  private defaultModel: string;
  private baseUrl: string;

  constructor(apiKey: string, defaultModel = 'gpt-5', baseUrl = 'https://api.openai.com') {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
    this.baseUrl = baseUrl;
  }

  async complete(messages: Message[], options?: LLMOptions): Promise<LLMResponse> {
    const model = options?.model ?? this.defaultModel;
    const maxTokens = options?.maxTokens ?? 8192;

    const body = {
      model,
      max_tokens: maxTokens,
      messages: this.convertMessages(messages),
      temperature: options?.temperature,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    const retryDelays = this.getRetryDelays();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const retryAfter = response.headers.get('retry-after') ?? undefined;
          this.handleError(response.status, await response.text(), retryAfter ? { 'retry-after': retryAfter } : undefined);
        }

        const data = await response.json() as Record<string, unknown>;
        return this.mapResponse(data);
      } catch (err) {
        clearTimeout(timeout);
        lastError = err as Error;

        if (err instanceof LLMAuthError) throw err; // Don't retry auth errors

        if (attempt < retryDelays.length) {
          await this.sleep(retryDelays[attempt]!);
        }
      }
    }

    throw lastError ?? new LLMServerError('Unknown error', 0);
  }

  // ── Format conversion ──

  /**
   * Convert Seahorse Message array to OpenAI Chat Completions format.
   * OpenAI keeps system messages in the messages array (unlike Anthropic).
   */
  convertMessages(messages: Message[]): Array<{ role: string; content: unknown; tool_calls?: unknown; tool_call_id?: string }> {
    const result: Array<{ role: string; content: unknown; tool_calls?: unknown; tool_call_id?: string }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        result.push({ role: 'system', content: msg.content });
      } else if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          result.push({
            role: 'assistant',
            content: msg.content || null,
            tool_calls: msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            })),
          });
        } else {
          result.push({ role: 'assistant', content: msg.content });
        }
      } else if (msg.role === 'tool') {
        result.push({
          role: 'tool',
          tool_call_id: msg.toolCallId,
          content: msg.content,
        });
      }
    }

    return result;
  }

  // ── Response mapping ──

  mapResponse(data: Record<string, unknown>): LLMResponse {
    const choices = data['choices'] as Array<Record<string, unknown>>;
    const choice = choices?.[0];
    const message = choice?.['message'] as Record<string, unknown> | undefined;
    const usage = data['usage'] as { prompt_tokens: number; completion_tokens: number } | undefined;
    const finishReason = (choice?.['finish_reason'] as string) ?? 'stop';

    const textContent = (message?.['content'] as string) ?? '';
    const toolCalls: ToolCall[] = [];

    const rawToolCalls = message?.['tool_calls'] as Array<Record<string, unknown>> | undefined;
    if (rawToolCalls) {
      for (const tc of rawToolCalls) {
        const fn = tc['function'] as Record<string, unknown> | undefined;
        let args: Record<string, unknown> = {};
        if (typeof fn?.['arguments'] === 'string') {
          try {
            args = JSON.parse(fn['arguments'] as string);
          } catch {
            args = {};
          }
        }
        toolCalls.push({
          id: (tc['id'] as string) ?? '',
          name: (fn?.['name'] as string) ?? '',
          arguments: args,
        });
      }
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: { input: usage?.prompt_tokens ?? 0, output: usage?.completion_tokens ?? 0 },
      finishReason: finishReason === 'tool_calls' ? 'tool_calls' : finishReason === 'stop' ? 'stop' : finishReason === 'length' ? 'length' : 'stop',
    };
  }

  // ── Error handling ──

  handleError(status: number, body: string, headers?: Record<string, string>): never {
    switch (status) {
      case 401:
        throw new LLMAuthError(`Authentication failed: ${body}`);
      case 429: {
        const retryAfter = headers?.['retry-after'] ? parseInt(headers['retry-after'], 10) : 60;
        throw new LLMRateLimitError(`Rate limited: ${body}`, retryAfter);
      }
      case 500:
      case 502:
      case 503:
      case 504:
        throw new LLMServerError(`Server error (${status}): ${body}`, status);
      default:
        throw new LLMServerError(`Unexpected error (${status}): ${body}`, status);
    }
  }

  // ── Retry logic ──

  getRetryDelays(): number[] {
    return [1000, 2000, 4000]; // 1s, 2s, 4s exponential backoff
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
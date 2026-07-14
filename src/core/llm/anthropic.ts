import type { LLMProvider, LLMResponse, LLMOptions, Message, ToolCall } from './types.js';
import { LLMAuthError, LLMRateLimitError, LLMServerError } from './types.js';

/**
 * Anthropic Claude provider implementation.
 * Wraps the Anthropic Messages API.
 * Corresponds to SPEC §3.2.
 */
export class AnthropicProvider implements LLMProvider {
  readonly providerId = 'anthropic';
  readonly models = ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5'];

  private apiKey: string;
  private defaultModel: string;
  private baseUrl: string;

  constructor(apiKey: string, defaultModel = 'claude-sonnet-5', baseUrl = 'https://api.anthropic.com') {
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
      system: this.extractSystem(messages),
      messages: this.convertMessages(messages),
      temperature: options?.temperature,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    const retryDelays = this.getRetryDelays();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
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

  private extractSystem(messages: Message[]): string {
    const systemMsgs = messages.filter((m) => m.role === 'system');
    return systemMsgs.map((m) => m.content).join('\n');
  }

  convertMessages(messages: Message[]): Array<{ role: string; content: unknown }> {
    const result: Array<{ role: string; content: unknown }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') continue; // Handled by extractSystem

      if (msg.role === 'user') {
        result.push({ role: 'user', content: msg.content });
      } else if (msg.role === 'assistant') {
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          result.push({
            role: 'assistant',
            content: msg.toolCalls.map((tc) => ({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments,
            })),
          });
        } else {
          result.push({ role: 'assistant', content: msg.content });
        }
      } else if (msg.role === 'tool') {
        result.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId,
              content: msg.content,
            },
          ],
        });
      }
    }

    return result;
  }

  // ── Response mapping ──

  mapResponse(data: Record<string, unknown>): LLMResponse {
    const content = data['content'] as Array<Record<string, unknown>>;
    const usage = data['usage'] as { input_tokens: number; output_tokens: number };
    const stopReason = (data['stop_reason'] as string) ?? 'end_turn';

    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const block of content) {
      if (block['type'] === 'text') {
        textContent += (block['text'] as string) ?? '';
      } else if (block['type'] === 'tool_use') {
        toolCalls.push({
          id: (block['id'] as string) ?? '',
          name: (block['name'] as string) ?? '',
          arguments: (block['input'] as Record<string, unknown>) ?? {},
        });
      }
    }

    return {
      content: textContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: { input: usage?.input_tokens ?? 0, output: usage?.output_tokens ?? 0 },
      finishReason: stopReason === 'tool_use' ? 'tool_calls' : 'stop',
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
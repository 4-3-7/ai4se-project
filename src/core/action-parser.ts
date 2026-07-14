import type { LLMResponse, ToolCall } from '../core/llm/types.js';

/**
 * Internal action representation after parsing an LLM response.
 * Corresponds to SPEC §6.1.
 */
export interface Action {
  type: 'tool_call' | 'text_response';
  toolCall?: ToolCall;
  textContent?: string;
}

/**
 * Parse an LLM response into a list of structured actions.
 *
 * - If the response contains toolCalls, each becomes a tool_call Action.
 * - Otherwise, the text content becomes a text_response Action.
 * - Empty toolCalls array falls through to text_response.
 */
export function parseActions(response: LLMResponse): Action[] {
  // Tool calls take priority over text content
  if (response.toolCalls && response.toolCalls.length > 0) {
    return response.toolCalls.map((tc) => ({
      type: 'tool_call' as const,
      toolCall: tc,
    }));
  }

  // Fall through: text-only response (or empty)
  return [
    {
      type: 'text_response' as const,
      textContent: response.content,
    },
  ];
}
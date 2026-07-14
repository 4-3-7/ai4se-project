/**
 * Tool system base types.
 * Corresponds to SPEC §3.4 and §6.1.
 */

/** JSON Schema for tool parameters (used in LLM tool definitions) */
export interface JSONSchema {
  type: string;
  properties?: Record<string, { type: string; description?: string; enum?: string[] }>;
  required?: string[];
  additionalProperties?: boolean;
}

/** Result of a tool execution */
export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
  duration?: number;
}

/** A tool that the agent can invoke */
export interface Tool {
  /** Unique tool name (e.g. "read_file", "shell_exec") */
  name: string;
  /** Human-readable description for the LLM */
  description: string;
  /** JSON Schema describing the tool's parameters */
  parameters: JSONSchema;
  /** Execute the tool with the given arguments */
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}
import type { Tool, ToolResult, JSONSchema } from './types.js';

/**
 * LLM-facing tool definition format (Anthropic/OpenAI compatible).
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: JSONSchema;
}

/**
 * Tool registry — manages registration, lookup, and execution of tools.
 * Corresponds to SPEC §3.4.
 */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  /** Register a tool. Throws if the name is already registered. */
  register(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Get a tool by name. Throws if not found. */
  get(name: string): Tool {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found.`);
    }
    return tool;
  }

  /** Check if a tool is registered. */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** List all registered tool names. */
  list(): string[] {
    return Array.from(this.tools.keys());
  }

  /** Execute a tool by name with the given arguments. */
  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.get(name);
    return tool.execute(args);
  }

  /** Generate LLM-compatible tool definitions (Anthropic tool_use / OpenAI function_call format). */
  toToolDefinitions(): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];
    for (const tool of this.tools.values()) {
      definitions.push({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      });
    }
    return definitions;
  }
}
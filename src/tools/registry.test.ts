import { describe, it, expect, vi } from 'vitest';
import { ToolRegistry } from './registry.js';
import type { Tool, ToolResult } from './types.js';

// ── Helpers ──

function makeMockTool(overrides: Partial<Tool> = {}): Tool {
  return {
    name: 'mock_tool',
    description: 'A mock tool for testing.',
    parameters: {
      type: 'object',
      properties: { input: { type: 'string' } },
      required: ['input'],
    },
    execute: vi.fn().mockResolvedValue({
      success: true,
      data: 'mock result',
    } as ToolResult),
    ...overrides,
  };
}

// ── Tests ──

describe('ToolRegistry', () => {
  // ── Registration ──

  it('should register a tool and retrieve it by name', () => {
    const registry = new ToolRegistry();
    const tool = makeMockTool({ name: 'read_file' });

    registry.register(tool);

    const retrieved = registry.get('read_file');
    expect(retrieved).toBe(tool);
  });

  it('should throw when registering a duplicate tool name', () => {
    const registry = new ToolRegistry();
    registry.register(makeMockTool({ name: 'read_file' }));

    expect(() => {
      registry.register(makeMockTool({ name: 'read_file' }));
    }).toThrow(/already registered/i);
  });

  it('should register multiple distinct tools', () => {
    const registry = new ToolRegistry();
    registry.register(makeMockTool({ name: 'read_file' }));
    registry.register(makeMockTool({ name: 'write_file' }));
    registry.register(makeMockTool({ name: 'shell_exec' }));

    expect(registry.get('read_file')).toBeDefined();
    expect(registry.get('write_file')).toBeDefined();
    expect(registry.get('shell_exec')).toBeDefined();
  });

  // ── Retrieval ──

  it('should throw when getting an unregistered tool', () => {
    const registry = new ToolRegistry();

    expect(() => {
      registry.get('nonexistent');
    }).toThrow(/not found/i);
  });

  it('should return undefined for has() when tool is not registered', () => {
    const registry = new ToolRegistry();
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('should return true for has() when tool is registered', () => {
    const registry = new ToolRegistry();
    registry.register(makeMockTool({ name: 'shell_exec' }));
    expect(registry.has('shell_exec')).toBe(true);
  });

  // ── Listing ──

  it('should list all registered tool names', () => {
    const registry = new ToolRegistry();
    registry.register(makeMockTool({ name: 'read_file' }));
    registry.register(makeMockTool({ name: 'shell_exec' }));

    const names = registry.list();
    expect(names).toHaveLength(2);
    expect(names).toContain('read_file');
    expect(names).toContain('shell_exec');
  });

  it('should return empty list when no tools are registered', () => {
    const registry = new ToolRegistry();
    expect(registry.list()).toEqual([]);
  });

  // ── Tool definitions (for LLM API) ──

  it('should generate tool definitions in Anthropic/OpenAI format', () => {
    const registry = new ToolRegistry();
    registry.register(
      makeMockTool({
        name: 'read_file',
        description: 'Read a file from the filesystem.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the file' },
          },
          required: ['path'],
        },
      }),
    );

    const definitions = registry.toToolDefinitions();

    expect(definitions).toHaveLength(1);
    expect(definitions[0]!.name).toBe('read_file');
    expect(definitions[0]!.description).toBe('Read a file from the filesystem.');
    expect(definitions[0]!.input_schema).toEqual({
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
      },
      required: ['path'],
    });
  });

  it('should generate multiple tool definitions', () => {
    const registry = new ToolRegistry();
    registry.register(makeMockTool({ name: 'tool_a', description: 'Tool A' }));
    registry.register(makeMockTool({ name: 'tool_b', description: 'Tool B' }));

    const definitions = registry.toToolDefinitions();
    expect(definitions).toHaveLength(2);
    expect(definitions[0]!.name).toBe('tool_a');
    expect(definitions[1]!.name).toBe('tool_b');
  });

  // ── Tool execution ──

  it('should execute a registered tool and return the result', async () => {
    const registry = new ToolRegistry();
    const execute = vi.fn().mockResolvedValue({
      success: true,
      data: { content: 'file contents' },
    } as ToolResult);
    registry.register(makeMockTool({ name: 'read_file', execute }));

    const result = await registry.execute('read_file', { path: 'src/index.ts' });

    expect(execute).toHaveBeenCalledWith({ path: 'src/index.ts' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ content: 'file contents' });
  });

  it('should throw when executing an unregistered tool', async () => {
    const registry = new ToolRegistry();

    await expect(
      registry.execute('nonexistent', {}),
    ).rejects.toThrow(/not found/i);
  });

  it('should propagate errors from tool execution', async () => {
    const registry = new ToolRegistry();
    registry.register(
      makeMockTool({
        name: 'failing_tool',
        execute: async () => {
          throw new Error('Tool execution failed');
        },
      }),
    );

    await expect(
      registry.execute('failing_tool', {}),
    ).rejects.toThrow('Tool execution failed');
  });
});
import { describe, it, expect } from 'vitest';
import { createShellExecTool } from './shell-exec.js';
import type { Tool } from './types.js';

describe('ShellExecTool', () => {
  let tool: Tool;

  // ── Setup ──

  it('should create a shell exec tool with correct metadata', () => {
    tool = createShellExecTool();

    expect(tool.name).toBe('shell_exec');
    expect(tool.description).toBeDefined();
    expect(tool.parameters).toBeDefined();
    expect(tool.parameters.type).toBe('object');
    expect(tool.parameters.properties).toHaveProperty('command');
    expect(tool.parameters.required).toContain('command');
  });

  // ── Basic execution ──

  it('should execute a simple command and return stdout', async () => {
    tool = createShellExecTool();
    const result = await tool.execute({ command: 'echo hello' });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const data = result.data as { stdout: string; stderr: string; exitCode: number };
    expect(data.stdout).toContain('hello');
    expect(data.exitCode).toBe(0);
  });

  it('should capture stderr from a failing command', async () => {
    tool = createShellExecTool();

    // Use a command that writes to stderr but exits 0
    // On Windows/bash: `>&2 echo error` redirects to stderr
    const result = await tool.execute({
      command: 'echo error >&2',
    });

    expect(result.success).toBe(true);
    const data = result.data as { stdout: string; stderr: string; exitCode: number };
    expect(data.exitCode).toBe(0);
  });

  it('should return failure for non-zero exit code', async () => {
    tool = createShellExecTool();

    // Use a command that fails
    const result = await tool.execute({
      command: 'exit 1',
    });

    expect(result.success).toBe(false);
    const data = result.data as { exitCode: number };
    expect(data.exitCode).toBe(1);
  });

  // ── Working directory ──

  it('should execute in the specified working directory', async () => {
    tool = createShellExecTool({ defaultCwd: process.cwd() });

    // Use the project root as a known-good working directory
    const result = await tool.execute({
      command: 'pwd',
      cwd: process.cwd(),
    });

    expect(result.success).toBe(true);
    const data = result.data as { stdout: string };
    expect(data.stdout.trim()).toBeTruthy();
  });

  it('should use default cwd when not specified', async () => {
    tool = createShellExecTool({ defaultCwd: process.cwd() });

    const result = await tool.execute({ command: 'pwd' });

    expect(result.success).toBe(true);
    const data = result.data as { stdout: string };
    expect(data.stdout.trim()).toBeTruthy();
  });

  // ── Timeout ──

  it('should timeout on long-running commands', async () => {
    tool = createShellExecTool({ defaultTimeout: 500 });

    const result = await tool.execute({
      command: 'sleep 5',
      timeout: 500,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });

  // ── Edge cases ──

  it('should handle empty command gracefully', async () => {
    tool = createShellExecTool();

    const result = await tool.execute({ command: '' });

    // Empty command should fail
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should include duration in result', async () => {
    tool = createShellExecTool();

    const result = await tool.execute({ command: 'echo quick' });

    expect(result.duration).toBeDefined();
    expect(result.duration!).toBeGreaterThanOrEqual(0);
  });
});
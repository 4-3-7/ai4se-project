import { describe, it, expect } from 'vitest';
import { createTestRunnerTool, createLintRunnerTool } from './test-runner.js';

describe('createTestRunnerTool', () => {
  it('should create a test runner tool with correct metadata', () => {
    const tool = createTestRunnerTool();

    expect(tool.name).toBe('run_tests');
    expect(tool.description).toBeDefined();
    expect(tool.parameters.required).toContain('command');
  });

  it('should run a passing test command', async () => {
    const tool = createTestRunnerTool();

    const result = await tool.execute({ command: 'echo "Tests: 5 passed" && exit 0' });

    expect(result.success).toBe(true);
    const data = result.data as { stdout: string };
    expect(data.stdout).toContain('5 passed');
  });

  it('should report failure for failing tests', async () => {
    const tool = createTestRunnerTool();

    const result = await tool.execute({ command: 'echo "1 failed" && exit 1' });

    expect(result.success).toBe(false);
  });
});

describe('createLintRunnerTool', () => {
  it('should create a lint runner tool with correct metadata', () => {
    const tool = createLintRunnerTool();

    expect(tool.name).toBe('run_lint');
    expect(tool.description).toBeDefined();
    expect(tool.parameters.required).toContain('command');
  });

  it('should run a passing lint command', async () => {
    const tool = createLintRunnerTool();

    const result = await tool.execute({ command: 'echo "0 problems" && exit 0' });

    expect(result.success).toBe(true);
  });

  it('should report lint warnings as success (warnings are not errors)', async () => {
    const tool = createLintRunnerTool();

    const result = await tool.execute({ command: 'echo "3 warnings" && exit 0' });

    expect(result.success).toBe(true);
  });
});
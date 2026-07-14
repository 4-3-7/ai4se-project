import { exec } from 'node:child_process';
import type { Tool, ToolResult } from './types.js';

/**
 * Create a test runner tool that executes a test command.
 */
export function createTestRunnerTool(): Tool {
  return {
    name: 'run_tests',
    description: 'Run the test suite. Default command is "npm test".',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The test command to execute (default: "npm test").',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (optional).',
        },
      },
      required: ['command'],
    },
    execute: (args: Record<string, unknown>) => execCommand(String(args.command), String(args.cwd ?? process.cwd())),
  };
}

/**
 * Create a lint runner tool that executes a lint command.
 */
export function createLintRunnerTool(): Tool {
  return {
    name: 'run_lint',
    description: 'Run the linter. Default command is "npm run lint".',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The lint command to execute (default: "npm run lint").',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (optional).',
        },
      },
      required: ['command'],
    },
    execute: (args: Record<string, unknown>) => execCommand(String(args.command), String(args.cwd ?? process.cwd())),
  };
}

function execCommand(command: string, cwd: string): Promise<ToolResult> {
  return new Promise((resolve) => {
    exec(
      command,
      { cwd, timeout: 120_000, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        resolve({
          success: error === null,
          data: { stdout, stderr, exitCode: error ? (error as { code?: number }).code ?? 1 : 0 },
          error: error?.message,
        });
      },
    );
  });
}
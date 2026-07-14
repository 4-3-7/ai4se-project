import { exec, type ExecException } from 'node:child_process';
import type { Tool, ToolResult } from './types.js';

/** Configuration for the shell exec tool */
export interface ShellExecConfig {
  /** Default working directory */
  defaultCwd?: string;
  /** Default timeout in milliseconds */
  defaultTimeout?: number;
}

/** Arguments passed to the shell_exec tool */
export interface ShellExecArgs {
  command: string;
  cwd?: string;
  timeout?: number;
}

/**
 * Execute a shell command and return the result.
 * Uses child_process.exec with a timeout and working directory.
 */
function execCommand(args: ShellExecArgs, config: ShellExecConfig): Promise<ToolResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const cmd = args.command.trim();
    if (!cmd) {
      resolve({
        success: false,
        data: { stdout: '', stderr: '', exitCode: -1 },
        error: 'Empty command.',
        duration: 0,
      });
      return;
    }

    const timeout = args.timeout ?? config.defaultTimeout ?? 60_000;
    const cwd = args.cwd ?? config.defaultCwd ?? process.cwd();

    const child = exec(
      cmd,
      {
        cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const duration = Date.now() - startTime;

        if (error) {
          const execErr = error as ExecException;
          const isTimeout = execErr.killed === true;

          resolve({
            success: false,
            data: {
              stdout,
              stderr,
              exitCode: isTimeout ? -1 : (execErr.code ?? 1),
            },
            error: isTimeout ? `Command timed out after ${timeout}ms.` : error.message,
            duration,
          });
          return;
        }

        resolve({
          success: true,
          data: { stdout, stderr, exitCode: 0 },
          duration,
        });
      },
    );

    // Handle the case where the process is killed by timeout
    child.on('exit', (code) => {
      if (code === null) {
        // Killed by signal (likely timeout)
        const duration = Date.now() - startTime;
        resolve({
          success: false,
          data: { stdout: '', stderr: '', exitCode: -1 },
          error: `Command timed out after ${timeout}ms.`,
          duration,
        });
      }
    });
  });
}

/**
 * Create a shell_exec tool for the tool registry.
 */
export function createShellExecTool(config: ShellExecConfig = {}): Tool {
  return {
    name: 'shell_exec',
    description:
      'Execute a shell command and return stdout, stderr, and exit code. Use this to run tests, lint, build, or any CLI tool.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for the command (optional).',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (optional, default 60000).',
        },
      },
      required: ['command'],
    },
    execute: (args: Record<string, unknown>) =>
      execCommand(args as unknown as ShellExecArgs, config),
  };
}
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Tool, ToolResult } from './types.js';

const DEFAULT_MAX_LINES = 2000;

// ── read_file ──

export function createReadFileTool(): Tool {
  return {
    name: 'read_file',
    description: 'Read a file from the filesystem. Returns content with optional offset and limit.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to read.' },
        offset: { type: 'number', description: 'Line number to start reading from (0-indexed).' },
        limit: { type: 'number', description: 'Maximum number of lines to read.' },
      },
      required: ['path'],
    },
    execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const filePath = String(args.path);
      const offset = typeof args.offset === 'number' ? args.offset : undefined;
      const limit = typeof args.limit === 'number' ? args.limit : DEFAULT_MAX_LINES;

      try {
        if (!fs.existsSync(filePath)) {
          return { success: false, data: null, error: `File not found: ${filePath}` };
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        const start = offset ? Math.max(0, offset) : 0;
        const end = start + limit;
        const sliced = lines.slice(start, end);

        const truncated = lines.length > end;

        return {
          success: true,
          data: {
            content: sliced.join('\n'),
            totalLines: lines.length,
            linesRead: sliced.length,
            truncated,
          },
        };
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message };
      }
    },
  };
}

// ── write_file ──

export function createWriteFileTool(): Tool {
  return {
    name: 'write_file',
    description: 'Write content to a file. Creates parent directories automatically.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to write.' },
        content: { type: 'string', description: 'Content to write to the file.' },
      },
      required: ['path', 'content'],
    },
    execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const filePath = String(args.path);
      const content = String(args.content);

      try {
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');

        return { success: true, data: { path: filePath, bytesWritten: Buffer.byteLength(content, 'utf-8') } };
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message };
      }
    },
  };
}

// ── edit_file ──

export function createEditFileTool(): Tool {
  return {
    name: 'edit_file',
    description:
      'Edit a file by replacing an exact string. old_string must be unique in the file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file to edit.' },
        old_string: { type: 'string', description: 'Exact string to replace.' },
        new_string: { type: 'string', description: 'Replacement string.' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
      const filePath = String(args.path);
      const oldStr = String(args.old_string);
      const newStr = String(args.new_string);

      try {
        if (!fs.existsSync(filePath)) {
          return { success: false, data: null, error: `File not found: ${filePath}` };
        }

        const content = fs.readFileSync(filePath, 'utf-8');

        const occurrences = countOccurrences(content, oldStr);

        if (occurrences === 0) {
          return {
            success: false,
            data: null,
            error: `old_string not found in file: "${oldStr.substring(0, 50)}..."`,
          };
        }

        if (occurrences > 1) {
          return {
            success: false,
            data: null,
            error: `old_string matches ${occurrences} times in the file. It must be unique.`,
          };
        }

        const newContent = content.replace(oldStr, newStr);
        fs.writeFileSync(filePath, newContent, 'utf-8');

        return { success: true, data: { path: filePath, replaced: true } };
      } catch (err) {
        return { success: false, data: null, error: (err as Error).message };
      }
    },
  };
}

function countOccurrences(text: string, search: string): number {
  if (!search) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(search, pos)) !== -1) {
    count++;
    pos += search.length;
  }
  return count;
}
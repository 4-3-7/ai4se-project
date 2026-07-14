import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReadFileTool, createWriteFileTool, createEditFileTool } from './file-tools.js';
import type { Tool } from './types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ── Helpers ──

let tempDir: string;
let readTool: Tool;
let writeTool: Tool;
let editTool: Tool;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seahorse-file-'));
  readTool = createReadFileTool();
  writeTool = createWriteFileTool();
  editTool = createEditFileTool();
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function filePath(name: string): string {
  return path.join(tempDir, name);
}

// ── read_file ──

describe('read_file', () => {
  it('should read file contents', async () => {
    fs.writeFileSync(filePath('test.txt'), 'hello world');

    const result = await readTool.execute({ path: filePath('test.txt') });

    expect(result.success).toBe(true);
    expect((result.data as { content: string }).content).toBe('hello world');
  });

  it('should return error for non-existent file', async () => {
    const result = await readTool.execute({ path: filePath('nonexistent.txt') });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should support offset and limit', async () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');
    fs.writeFileSync(filePath('big.txt'), lines);

    const result = await readTool.execute({ path: filePath('big.txt'), offset: 10, limit: 5 });

    expect(result.success).toBe(true);
    const content = (result.data as { content: string }).content;
    const resultLines = content.split('\n');
    expect(resultLines[0]).toContain('line 11');
    expect(resultLines.length).toBeLessThanOrEqual(5);
  });

  it('should truncate to 2000 lines by default', async () => {
    const lines = Array.from({ length: 2500 }, (_, i) => `line ${i + 1}`).join('\n');
    fs.writeFileSync(filePath('huge.txt'), lines);

    const result = await readTool.execute({ path: filePath('huge.txt') });

    expect(result.success).toBe(true);
    const content = (result.data as { content: string }).content;
    const truncationNote = (result.data as { truncated: boolean }).truncated;
    expect(truncationNote).toBe(true);
    expect(content.split('\n').length).toBeLessThanOrEqual(2000);
  });
});

// ── write_file ──

describe('write_file', () => {
  it('should write content to a new file', async () => {
    const result = await writeTool.execute({ path: filePath('new.ts'), content: 'const x = 1;' });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath('new.ts'), 'utf-8')).toBe('const x = 1;');
  });

  it('should overwrite an existing file', async () => {
    fs.writeFileSync(filePath('existing.ts'), 'old content');
    await writeTool.execute({ path: filePath('existing.ts'), content: 'new content' });

    expect(fs.readFileSync(filePath('existing.ts'), 'utf-8')).toBe('new content');
  });

  it('should create parent directories automatically', async () => {
    const deepPath = path.join(tempDir, 'a', 'b', 'c', 'deep.ts');
    await writeTool.execute({ path: deepPath, content: 'deep' });

    expect(fs.existsSync(deepPath)).toBe(true);
    expect(fs.readFileSync(deepPath, 'utf-8')).toBe('deep');
  });
});

// ── edit_file ──

describe('edit_file', () => {
  it('should replace old_string with new_string', async () => {
    fs.writeFileSync(filePath('edit.ts'), 'const greeting = "hello";');

    const result = await editTool.execute({
      path: filePath('edit.ts'),
      old_string: 'const greeting = "hello";',
      new_string: 'const greeting = "hi";',
    });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath('edit.ts'), 'utf-8')).toBe('const greeting = "hi";');
  });

  it('should return error when old_string is not found', async () => {
    fs.writeFileSync(filePath('edit.ts'), 'const x = 1;');

    const result = await editTool.execute({
      path: filePath('edit.ts'),
      old_string: 'const y = 2;',
      new_string: 'const y = 3;',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should return error when old_string has multiple matches', async () => {
    fs.writeFileSync(filePath('edit.ts'), 'const x = 1;\nconst x = 1;');

    const result = await editTool.execute({
      path: filePath('edit.ts'),
      old_string: 'const x = 1;',
      new_string: 'const y = 2;',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('matches');
  });

  it('should handle multiline replacements', async () => {
    fs.writeFileSync(filePath('edit.ts'), 'function foo() {\n  return 1;\n}');

    const result = await editTool.execute({
      path: filePath('edit.ts'),
      old_string: 'function foo() {\n  return 1;\n}',
      new_string: 'function foo() {\n  return 2;\n}',
    });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath('edit.ts'), 'utf-8')).toBe('function foo() {\n  return 2;\n}');
  });

  it('should return error for non-existent file', async () => {
    const result = await editTool.execute({
      path: filePath('nonexistent.ts'),
      old_string: 'a',
      new_string: 'b',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});
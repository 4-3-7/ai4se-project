import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from './file-store.js';
import type { MemoryEntry } from './types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let tempDir: string;
let store: MemoryStore;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seahorse-mem-'));
  store = new MemoryStore(tempDir);
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'test-entry',
    content: 'Use 2-space indentation.',
    metadata: {
      type: 'convention',
      tags: ['style', 'indentation'],
      createdAt: new Date(),
      updatedAt: new Date(),
      relevance: 0.8,
    },
    ...overrides,
  };
}

describe('MemoryStore', () => {
  it('should write and read a memory entry', () => {
    const entry = makeEntry({ id: 'coding-style' });
    store.write(entry);

    const retrieved = store.read('coding-style');
    expect(retrieved).toBeDefined();
    expect(retrieved!.content).toBe('Use 2-space indentation.');
    expect(retrieved!.metadata.type).toBe('convention');
  });

  it('should list all memory entries', () => {
    store.write(makeEntry({ id: 'a' }));
    store.write(makeEntry({ id: 'b' }));
    store.write(makeEntry({ id: 'c' }));

    const ids = store.list();
    expect(ids).toHaveLength(3);
    expect(ids).toContain('a');
    expect(ids).toContain('b');
    expect(ids).toContain('c');
  });

  it('should update an existing entry', () => {
    store.write(makeEntry({ id: 'style', content: 'Use tabs.' }));
    store.write(makeEntry({ id: 'style', content: 'Use 2 spaces.' }));

    const retrieved = store.read('style');
    expect(retrieved!.content).toBe('Use 2 spaces.');
  });

  it('should delete an entry', () => {
    store.write(makeEntry({ id: 'temp' }));
    expect(store.read('temp')).toBeDefined();

    store.delete('temp');
    expect(store.read('temp')).toBeNull();
  });

  it('should return null for non-existent entry', () => {
    expect(store.read('nonexistent')).toBeNull();
  });

  it('should persist entries across instances', () => {
    store.write(makeEntry({ id: 'persist' }));

    const store2 = new MemoryStore(tempDir);
    expect(store2.read('persist')).toBeDefined();
  });

  it('should handle empty store gracefully', () => {
    expect(store.list()).toEqual([]);
    expect(store.read('any')).toBeNull();
  });
});
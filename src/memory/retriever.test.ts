import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from './file-store.js';
import { MemoryRetriever } from './retriever.js';
import type { MemoryEntry } from './types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let tempDir: string;
let store: MemoryStore;
let retriever: MemoryRetriever;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seahorse-ret-'));
  store = new MemoryStore(tempDir);
  retriever = new MemoryRetriever(store);

  // Seed test data
  store.write({
    id: 'coding-style',
    content: 'Always use 2-space indentation in TypeScript files.',
    metadata: { type: 'convention', tags: ['style', 'typescript'], createdAt: new Date(), updatedAt: new Date(), relevance: 0.8 },
  });
  store.write({
    id: 'no-any',
    content: 'Never use the `any` type in TypeScript code.',
    metadata: { type: 'convention', tags: ['typescript', 'types'], createdAt: new Date(), updatedAt: new Date(), relevance: 0.9 },
  });
  store.write({
    id: 'test-framework',
    content: 'We use Vitest as the test framework for this project.',
    metadata: { type: 'decision', tags: ['testing', 'vitest'], createdAt: new Date(), updatedAt: new Date(), relevance: 0.7 },
  });
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('MemoryRetriever', () => {
  it('should retrieve relevant memories by keyword', () => {
    const results = retriever.search('typescript style');

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.id === 'coding-style')).toBe(true);
  });

  it('should retrieve memories matching tag', () => {
    const results = retriever.search('testing');

    expect(results.some((r) => r.id === 'test-framework')).toBe(true);
  });

  it('should limit results to max 5', () => {
    // Add more entries to exceed limit
    for (let i = 0; i < 10; i++) {
      store.write({
        id: `extra-${i}`,
        content: `Extra memory ${i}`,
        metadata: { type: 'knowledge', tags: ['extra'], createdAt: new Date(), updatedAt: new Date(), relevance: 0.1 },
      });
    }

    const results = retriever.search('extra');
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it('should return empty array for no matches', () => {
    const results = retriever.search('zzz_nonexistent_zzz');
    expect(results).toEqual([]);
  });

  it('should sort by relevance score', () => {
    const results = retriever.search('typescript');

    if (results.length >= 2) {
      expect(results[0]!.metadata.relevance).toBeGreaterThanOrEqual(results[1]!.metadata.relevance);
    }
  });
});
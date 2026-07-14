import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MemoryEntry } from './types.js';

/**
 * File-based memory store.
 * Each memory is a Markdown file with YAML frontmatter.
 * Corresponds to SPEC §3.7.
 */
export class MemoryStore {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /** Write (create or update) a memory entry. */
  write(entry: MemoryEntry): void {
    const filePath = this.filePath(entry.id);
    const content = this.serialize(entry);
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  /** Read a memory entry by ID. Returns null if not found. */
  read(id: string): MemoryEntry | null {
    const filePath = this.filePath(id);
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    const entry = this.deserialize(content);
    if (entry) {
      entry.id = id;
    }
    return entry;
  }

  /** Delete a memory entry by ID. */
  delete(id: string): void {
    const filePath = this.filePath(id);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /** List all memory entry IDs. */
  list(): string[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''));
  }

  /** Get all entries. */
  getAll(): MemoryEntry[] {
    return this.list().map((id) => this.read(id)!).filter(Boolean);
  }

  private filePath(id: string): string {
    // Sanitize ID for filesystem
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dir, `${safe}.md`);
  }

  private serialize(entry: MemoryEntry): string {
    const meta = entry.metadata;
    return [
      '---',
      `type: ${meta.type}`,
      `tags: [${meta.tags.join(', ')}]`,
      `relevance: ${meta.relevance}`,
      `createdAt: ${meta.createdAt.toISOString()}`,
      `updatedAt: ${meta.updatedAt.toISOString()}`,
      '---',
      '',
      entry.content,
    ].join('\n');
  }

  private deserialize(content: string): MemoryEntry | null {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return null;

    const frontmatter = match[1]!;
    const body = match[2]!.trim();

    const meta: Record<string, string> = {};
    for (const line of frontmatter.split('\n')) {
      const kv = line.match(/^(\w+):\s*(.+)$/);
      if (kv) {
        meta[kv[1]!] = kv[2]!;
      }
    }

    const id = body.slice(0, 50).replace(/\s+/g, '-').toLowerCase();

    return {
      id: id || 'unknown',
      content: body,
      metadata: {
        type: (meta['type'] as MemoryEntry['metadata']['type']) || 'knowledge',
        tags: meta['tags'] ? meta['tags'].replace(/[\[\]]/g, '').split(',').map((t: string) => t.trim()) : [],
        createdAt: meta['createdAt'] ? new Date(meta['createdAt']) : new Date(),
        updatedAt: meta['updatedAt'] ? new Date(meta['updatedAt']) : new Date(),
        relevance: meta['relevance'] ? parseFloat(meta['relevance']) : 0.5,
      },
    };
  }
}
import type { MemoryStore } from './file-store.js';
import type { MemoryEntry } from './types.js';

/**
 * Memory retriever — keyword-based search with relevance scoring.
 * Corresponds to SPEC §3.7.
 */
export class MemoryRetriever {
  private store: MemoryStore;
  private maxResults: number;

  constructor(store: MemoryStore, maxResults = 5) {
    this.store = store;
    this.maxResults = maxResults;
  }

  /**
   * Search memories by query string.
   * Scores entries by keyword match in content and tags.
   */
  search(query: string): MemoryEntry[] {
    const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return [];

    const entries = this.store.getAll();

    const scored = entries.map((entry) => {
      let score = 0;
      const contentLower = entry.content.toLowerCase();
      const tagsLower = entry.metadata.tags.map((t) => t.toLowerCase());

      for (const kw of keywords) {
        if (contentLower.includes(kw)) score += 2;
        if (tagsLower.some((t) => t.includes(kw))) score += 3;
      }

      // Only boost by relevance if there's a keyword match
      if (score > 0) {
        score += entry.metadata.relevance;
      }

      return { entry, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxResults)
      .map((s) => s.entry);
  }
}
/**
 * Memory entry types.
 * Corresponds to SPEC §3.7 and §6.1.
 */

export interface MemoryEntry {
  id: string;
  content: string;
  metadata: {
    type: 'convention' | 'decision' | 'preference' | 'knowledge';
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
    relevance: number; // 0-1
  };
}
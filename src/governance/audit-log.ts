import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Action } from '../core/action-parser.js';
import type { GuardrailDecision } from './guardrail.js';
import type { HITLEvent } from './hitl-state-machine.js';
import type { ToolResult } from '../tools/types.js';

/**
 * A single audit log entry.
 * Corresponds to SPEC §3.5.4 and §6.1.
 */
export interface AuditEntry {
  timestamp: Date;
  sessionId: string;
  turnNumber: number;
  action: Action;
  guardrailDecision: GuardrailDecision;
  hitlEvent?: HITLEvent;
  executionResult?: ToolResult;
  feedback?: unknown;
}

/**
 * Audit logger configuration.
 */
export interface AuditLogConfig {
  /** Directory to store audit log files */
  logDir: string;
  /** Maximum entries in memory before flushing */
  flushThreshold?: number;
}

/**
 * Audit logger — records all tool executions and governance decisions.
 * Data is persisted as JSONL files for durability and auditability.
 *
 * Corresponds to SPEC §3.5.4.
 */
export class AuditLogger {
  private entries: AuditEntry[] = [];
  private logDir: string;
  private logFile: string;
  private flushThreshold: number;

  constructor(config: AuditLogConfig) {
    this.logDir = config.logDir;
    this.logFile = path.join(this.logDir, 'audit.jsonl');
    this.flushThreshold = config.flushThreshold ?? 1; // Flush immediately

    // Ensure log directory exists
    fs.mkdirSync(this.logDir, { recursive: true });

    // Load existing entries from disk
    this.loadFromDisk();
  }

  /**
   * Log an audit entry. Automatically sanitizes sensitive data
   * and persists to disk.
   */
  log(entry: AuditEntry): void {
    // Sanitize sensitive data
    const sanitized = this.sanitize(entry);

    this.entries.push(sanitized);

    // Flush to disk
    if (this.entries.length >= this.flushThreshold) {
      this.flush([sanitized]);
    }
  }

  /**
   * Get all logged entries (in-memory).
   */
  getEntries(): AuditEntry[] {
    return [...this.entries];
  }

  /**
   * Sanitize an entry to remove sensitive data (API keys, tokens).
   */
  private sanitize(entry: AuditEntry): AuditEntry {
    return {
      ...entry,
      action: this.sanitizeAction(entry.action),
    };
  }

  private sanitizeAction(action: Action): Action {
    if (action.type !== 'tool_call' || !action.toolCall) {
      return action;
    }

    const args = { ...action.toolCall.arguments };
    for (const key of Object.keys(args)) {
      const value = String(args[key]);
      // Redact API key patterns
      args[key] = value
        .replace(/sk-ant-[a-zA-Z0-9_-]+/g, '[REDACTED]')
        .replace(/sk-proj-[a-zA-Z0-9_-]+/g, '[REDACTED]')
        .replace(/sk-[a-zA-Z0-9]{32,}/g, '[REDACTED]')
        .replace(/Bearer\s+[a-zA-Z0-9._-]+/g, 'Bearer [REDACTED]');
    }

    return {
      ...action,
      toolCall: {
        ...action.toolCall,
        arguments: args,
      },
    };
  }

  /**
   * Flush entries to the JSONL file on disk.
   */
  private flush(newEntries: AuditEntry[]): void {
    const lines = newEntries.map((e) => JSON.stringify(e) + '\n').join('');
    fs.appendFileSync(this.logFile, lines, 'utf-8');
  }

  /**
   * Load existing entries from disk.
   */
  private loadFromDisk(): void {
    if (!fs.existsSync(this.logFile)) {
      return;
    }

    const content = fs.readFileSync(this.logFile, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as AuditEntry;
        // Convert timestamp string back to Date
        entry.timestamp = new Date(entry.timestamp);
        this.entries.push(entry);
      } catch {
        // Skip malformed lines
      }
    }
  }
}
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditLogger, type AuditEntry } from './audit-log.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Action } from '../core/action-parser.js';
import type { GuardrailDecision } from './guardrail.js';
import type { HITLEvent } from './hitl-state-machine.js';

// ── Helpers ──

function makeAction(): Action {
  return {
    type: 'tool_call',
    toolCall: {
      id: 'tc_1',
      name: 'shell_exec',
      arguments: { command: 'npm test' },
    },
  };
}

function makeDecision(): GuardrailDecision {
  return { allowed: true, riskLevel: 'none', requiresApproval: false };
}

function makeHITLEvent(): HITLEvent {
  return {
    sessionId: 'sess_1',
    turnNumber: 3,
    action: makeAction(),
    decision: makeDecision(),
    timestamp: new Date(),
    resolved: true,
  };
}

function setupTempDir(): string {
  const dir = path.join(os.tmpdir(), `seahorse-audit-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Tests ──

describe('AuditLogger', () => {
  let tempDir: string;
  let logger: AuditLogger;

  beforeEach(() => {
    tempDir = setupTempDir();
    logger = new AuditLogger({ logDir: tempDir });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ── Initialization ──

  it('should create the log directory', () => {
    const dir = path.join(os.tmpdir(), `seahorse-audit-test-new-${Date.now()}`);
    const localLogger = new AuditLogger({ logDir: dir });

    expect(fs.existsSync(dir)).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  // ── Logging ──

  it('should log a tool execution entry', () => {
    const entry: AuditEntry = {
      timestamp: new Date(),
      sessionId: 'sess_1',
      turnNumber: 1,
      action: makeAction(),
      guardrailDecision: makeDecision(),
      executionResult: {
        success: true,
        data: { stdout: 'PASS', stderr: '', exitCode: 0 },
      },
    };

    logger.log(entry);

    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.sessionId).toBe('sess_1');
    expect(entries[0]!.turnNumber).toBe(1);
  });

  it('should log a HITL event', () => {
    const entry: AuditEntry = {
      timestamp: new Date(),
      sessionId: 'sess_1',
      turnNumber: 3,
      action: makeAction(),
      guardrailDecision: {
        allowed: false,
        riskLevel: 'critical',
        matchedPattern: 'rm_root',
        reason: 'Dangerous command.',
        requiresApproval: true,
      },
      hitlEvent: makeHITLEvent(),
    };

    logger.log(entry);

    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.hitlEvent).toBeDefined();
    expect(entries[0]!.guardrailDecision.allowed).toBe(false);
  });

  it('should log multiple entries in order', () => {
    logger.log({ timestamp: new Date(), sessionId: 's', turnNumber: 1, action: makeAction(), guardrailDecision: makeDecision() });
    logger.log({ timestamp: new Date(), sessionId: 's', turnNumber: 2, action: makeAction(), guardrailDecision: makeDecision() });
    logger.log({ timestamp: new Date(), sessionId: 's', turnNumber: 3, action: makeAction(), guardrailDecision: makeDecision() });

    const entries = logger.getEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0]!.turnNumber).toBe(1);
    expect(entries[2]!.turnNumber).toBe(3);
  });

  it('should persist entries to disk as JSONL', () => {
    logger.log({
      timestamp: new Date(),
      sessionId: 'sess_persist',
      turnNumber: 1,
      action: makeAction(),
      guardrailDecision: makeDecision(),
    });

    // Create a new logger reading from the same directory
    const logger2 = new AuditLogger({ logDir: tempDir });
    const entries = logger2.getEntries();

    expect(entries).toHaveLength(1);
    expect(entries[0]!.sessionId).toBe('sess_persist');
  });

  // ── Sanitization ──

  it('should sanitize API key patterns from log entries', () => {
    const entry: AuditEntry = {
      timestamp: new Date(),
      sessionId: 'sess_1',
      turnNumber: 1,
      action: {
        type: 'tool_call',
        toolCall: {
          id: 'tc_1',
          name: 'shell_exec',
          arguments: {
            command: 'curl -H "Authorization: Bearer sk-ant-api-key12345" http://api.example.com',
          },
        },
      },
      guardrailDecision: makeDecision(),
    };

    logger.log(entry);

    const entries = logger.getEntries();
    const loggedCommand = entries[0]!.action.toolCall!.arguments.command as string;
    expect(loggedCommand).not.toContain('sk-ant-api-key12345');
    expect(loggedCommand).toContain('[REDACTED]');
  });

  it('should sanitize OpenAI key patterns', () => {
    const entry: AuditEntry = {
      timestamp: new Date(),
      sessionId: 'sess_1',
      turnNumber: 1,
      action: {
        type: 'tool_call',
        toolCall: {
          id: 'tc_1',
          name: 'shell_exec',
          arguments: {
            command: 'export OPENAI_API_KEY=sk-proj-abcdefghijklmnop',
          },
        },
      },
      guardrailDecision: makeDecision(),
    };

    logger.log(entry);

    const entries = logger.getEntries();
    const loggedCommand = entries[0]!.action.toolCall!.arguments.command as string;
    expect(loggedCommand).not.toContain('sk-proj-abcdefghijklmnop');
    expect(loggedCommand).toContain('[REDACTED]');
  });

  // ── Edge cases ──

  it('should handle entries without execution result', () => {
    const entry: AuditEntry = {
      timestamp: new Date(),
      sessionId: 'sess_1',
      turnNumber: 1,
      action: makeAction(),
      guardrailDecision: makeDecision(),
    };

    logger.log(entry);

    const entries = logger.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.executionResult).toBeUndefined();
  });

  it('should handle empty log directory gracefully', () => {
    const dir = path.join(os.tmpdir(), `seahorse-audit-empty-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });

    const emptyLogger = new AuditLogger({ logDir: dir });
    const entries = emptyLogger.getEntries();
    expect(entries).toEqual([]);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
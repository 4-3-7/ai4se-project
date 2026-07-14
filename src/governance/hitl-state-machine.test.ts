import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HITLStateMachine, SessionTerminatedError } from './hitl-state-machine.js';
import type { GuardrailDecision } from './guardrail.js';
import type { Action } from '../core/action-parser.js';

// ── Helpers ──

function makeAction(): Action {
  return {
    type: 'tool_call',
    toolCall: {
      id: 'tc_1',
      name: 'shell_exec',
      arguments: { command: 'rm -rf /' },
    },
  };
}

function makeBlockedDecision(): GuardrailDecision {
  return {
    allowed: false,
    riskLevel: 'critical',
    matchedPattern: 'rm_root',
    reason: 'Recursive deletion of root.',
    requiresApproval: true,
  };
}

// ── Tests ──

describe('HITLStateMachine', () => {
  let hitl: HITLStateMachine;

  beforeEach(() => {
    hitl = new HITLStateMachine({ timeoutMs: 300_000 });
  });

  // ── Initial state ──

  it('should start in IDLE state', () => {
    expect(hitl.getState()).toBe('idle');
  });

  it('should not be paused initially', () => {
    expect(hitl.isPaused()).toBe(false);
  });

  // ── Pause transition ──

  it('should transition from IDLE to PAUSED', () => {
    const event = hitl.pause(makeAction(), makeBlockedDecision());

    expect(hitl.getState()).toBe('paused');
    expect(hitl.isPaused()).toBe(true);
    expect(event.action).toBeDefined();
    expect(event.decision).toBeDefined();
  });

  it('should store the pending action and decision when paused', () => {
    const action = makeAction();
    const decision = makeBlockedDecision();

    hitl.pause(action, decision);

    const pending = hitl.getPendingAction();
    expect(pending).toBe(action);
  });

  it('should throw when pausing from PAUSED state', () => {
    hitl.pause(makeAction(), makeBlockedDecision());

    expect(() => {
      hitl.pause(makeAction(), makeBlockedDecision());
    }).toThrow(/already paused/i);
  });

  // ── ALLOW ──

  it('should transition from PAUSED to IDLE on ALLOW', () => {
    hitl.pause(makeAction(), makeBlockedDecision());

    const result = hitl.resolve('allow');

    expect(result.action).toBe('allow');
    expect(hitl.getState()).toBe('idle');
    expect(hitl.isPaused()).toBe(false);
  });

  it('should return the original command on ALLOW', () => {
    hitl.pause(makeAction(), makeBlockedDecision());

    const result = hitl.resolve('allow');

    expect(result.action).toBe('allow');
    expect(result.modifiedCommand).toBeUndefined();
  });

  // ── DENY ──

  it('should transition from PAUSED to IDLE on DENY', () => {
    hitl.pause(makeAction(), makeBlockedDecision());

    const result = hitl.resolve('deny');

    expect(result.action).toBe('deny');
    expect(hitl.getState()).toBe('idle');
  });

  // ── TERMINATE ──

  it('should throw SessionTerminatedError on TERMINATE', () => {
    hitl.pause(makeAction(), makeBlockedDecision());

    expect(() => {
      hitl.resolve('terminate');
    }).toThrow(SessionTerminatedError);
  });

  it('should transition to IDLE after TERMINATE error', () => {
    hitl.pause(makeAction(), makeBlockedDecision());

    try {
      hitl.resolve('terminate');
    } catch (e) {
      expect(e).toBeInstanceOf(SessionTerminatedError);
    }

    // State is reset
    expect(hitl.getState()).toBe('idle');
  });

  // ── Modified command ──

  it('should accept a modified command on ALLOW', () => {
    hitl.pause(makeAction(), makeBlockedDecision());

    const result = hitl.resolve('allow', 'npm test');

    expect(result.action).toBe('allow');
    expect(result.modifiedCommand).toBe('npm test');
  });

  // ── Invalid transitions ──

  it('should throw when resolving from IDLE state', () => {
    expect(() => {
      hitl.resolve('allow');
    }).toThrow(/not paused/i);
  });

  // ── Timeout ──

  it('should auto-deny on timeout', () => {
    const hitlWithTimeout = new HITLStateMachine({ timeoutMs: 10 });

    hitlWithTimeout.pause(makeAction(), makeBlockedDecision());

    // Wait for timeout
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // After timeout, a new pause should be possible (state reset)
        expect(hitlWithTimeout.getState()).toBe('idle');
        resolve();
      }, 50);
    });
  });

  // ── SessionTerminatedError ──

  it('should include session info in SessionTerminatedError', () => {
    const error = new SessionTerminatedError('User terminated the session.');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SessionTerminatedError');
    expect(error.message).toContain('terminated');
  });
});
import { describe, it, expect } from 'vitest';
import { shouldStop, type StopJudgeInput } from './stop-judge.js';

// ── Helpers ──

function makeInput(overrides: Partial<StopJudgeInput> = {}): StopJudgeInput {
  return {
    currentTurn: 1,
    maxTurns: 50,
    hasToolCalls: true,
    textContent: '',
    previousTextContents: [],
    ...overrides,
  };
}

// ── Tests ──

describe('shouldStop', () => {
  // ── Normal execution ──

  it('should return false when there are tool calls (agent still working)', () => {
    const input = makeInput({
      hasToolCalls: true,
      textContent: '',
    });

    const result = shouldStop(input);

    expect(result.shouldStop).toBe(false);
  });

  it('should return false early in the loop with tool calls', () => {
    const input = makeInput({
      currentTurn: 5,
      hasToolCalls: true,
    });

    const result = shouldStop(input);

    expect(result.shouldStop).toBe(false);
  });

  // ── Task completion ──

  it('should return true when there are no tool calls (task complete)', () => {
    const input = makeInput({
      hasToolCalls: false,
      textContent: 'The bug has been fixed. All tests pass.',
    });

    const result = shouldStop(input);

    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('task_complete');
  });

  it('should return true for text-only response even with partial content', () => {
    const input = makeInput({
      hasToolCalls: false,
      textContent: 'Done.',
    });

    const result = shouldStop(input);

    expect(result.shouldStop).toBe(true);
  });

  // ── Max turns ──

  it('should return true when maxTurns is reached', () => {
    const input = makeInput({
      currentTurn: 50,
      maxTurns: 50,
      hasToolCalls: true,
    });

    const result = shouldStop(input);

    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('max_turns');
  });

  it('should return true when exceeding maxTurns', () => {
    const input = makeInput({
      currentTurn: 51,
      maxTurns: 50,
      hasToolCalls: true,
    });

    const result = shouldStop(input);

    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('max_turns');
  });

  it('should return false one turn before maxTurns', () => {
    const input = makeInput({
      currentTurn: 49,
      maxTurns: 50,
      hasToolCalls: true,
    });

    const result = shouldStop(input);

    expect(result.shouldStop).toBe(false);
  });

  // ── Staleness detection ──

  it('should return true after 3 consecutive identical text responses', () => {
    const input = makeInput({
      currentTurn: 10,
      hasToolCalls: false,
      textContent: 'I cannot fix this.',
      previousTextContents: ['I cannot fix this.', 'I cannot fix this.'],
    });

    const result = shouldStop(input);

    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('staleness');
  });

  it('should return true with staleness reason (3 total identical)', () => {
    const input = makeInput({
      currentTurn: 10,
      hasToolCalls: false,
      textContent: 'I cannot fix this.',
      previousTextContents: ['I cannot fix this.', 'I cannot fix this.'],
    });

    const result = shouldStop(input);

    // 2 previous + 1 current = 3 total identical → staleness
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('staleness');
  });

  it('should return true with task_complete when previous texts differ', () => {
    const input = makeInput({
      currentTurn: 10,
      hasToolCalls: false,
      textContent: 'Trying approach B.',
      previousTextContents: ['Trying approach A.', 'Trying approach A.'],
    });

    const result = shouldStop(input);

    // No tool calls, different text → task_complete (not staleness)
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('task_complete');
  });

  it('should not check staleness when there are tool calls', () => {
    const input = makeInput({
      currentTurn: 10,
      hasToolCalls: true,
      textContent: 'Still working...',
      previousTextContents: ['Still working...', 'Still working...'],
    });

    const result = shouldStop(input);

    // Tool calls take priority, staleness check is skipped
    expect(result.shouldStop).toBe(false);
  });

  // ── Priority ordering ──

  it('should check maxTurns before staleness', () => {
    const input = makeInput({
      currentTurn: 50,
      maxTurns: 50,
      hasToolCalls: false,
      textContent: 'Done.',
      previousTextContents: ['Done.', 'Done.'],
    });

    const result = shouldStop(input);

    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('max_turns');
  });

  it('should check staleness before task_complete', () => {
    const input = makeInput({
      currentTurn: 10,
      hasToolCalls: false,
      textContent: 'All done!',
      previousTextContents: ['All done!', 'All done!'],
    });

    const result = shouldStop(input);

    // Staleness (3 identical) takes priority over task_complete
    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('staleness');
  });

  // ── Edge cases ──

  it('should handle empty previousTextContents', () => {
    const input = makeInput({
      currentTurn: 1,
      hasToolCalls: false,
      textContent: 'First response.',
      previousTextContents: [],
    });

    const result = shouldStop(input);

    expect(result.shouldStop).toBe(true);
    expect(result.reason).toBe('task_complete');
  });

  it('should handle turn 0 (edge)', () => {
    const input = makeInput({
      currentTurn: 0,
      maxTurns: 50,
      hasToolCalls: true,
    });

    const result = shouldStop(input);

    expect(result.shouldStop).toBe(false);
  });
});
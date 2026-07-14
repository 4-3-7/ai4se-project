/**
 * Stop Judge — determines whether the agent loop should terminate.
 * Corresponds to SPEC §3.3, step 5-6.
 */

export interface StopJudgeInput {
  /** Current turn number (1-indexed) */
  currentTurn: number;
  /** Maximum allowed turns */
  maxTurns: number;
  /** Whether the LLM returned tool calls */
  hasToolCalls: boolean;
  /** The text content of the current response */
  textContent: string;
  /** Text contents of the previous N responses (for staleness check) */
  previousTextContents: string[];
}

export interface StopJudgeDecision {
  shouldStop: boolean;
  reason?: 'task_complete' | 'max_turns' | 'staleness';
}

/**
 * Check priority:
 * 1. max_turns — hard limit reached
 * 2. staleness — 3+ consecutive identical text responses (stuck in a loop)
 * 3. task_complete — no tool calls, agent is done
 */
export function shouldStop(input: StopJudgeInput): StopJudgeDecision {
  // Priority 1: max turns
  if (input.currentTurn >= input.maxTurns) {
    return { shouldStop: true, reason: 'max_turns' };
  }

  // Priority 2: staleness — 3+ consecutive identical text responses
  // Only checked when there are no tool calls (agent is producing text, not acting)
  if (!input.hasToolCalls) {
    const allTexts = [...input.previousTextContents, input.textContent];
    if (allTexts.length >= 3) {
      const last = allTexts[allTexts.length - 1];
      const secondLast = allTexts[allTexts.length - 2];
      const thirdLast = allTexts[allTexts.length - 3];

      if (last !== undefined && last === secondLast && secondLast === thirdLast) {
        return { shouldStop: true, reason: 'staleness' };
      }
    }

    // Priority 3: no tool calls, different text → task complete
    return { shouldStop: true, reason: 'task_complete' };
  }

  // Tool calls present → continue working
  return { shouldStop: false };
}
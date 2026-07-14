import type { Action } from '../core/action-parser.js';
import type { GuardrailDecision } from './guardrail.js';

/**
 * HITL configuration.
 */
export interface HITLConfig {
  /** Timeout in milliseconds before auto-deny (default 300000 = 5 min) */
  timeoutMs: number;
}

/**
 * User's decision on a blocked action.
 */
export interface HITLDecision {
  action: 'allow' | 'deny' | 'terminate';
  /** User-provided reason (optional) */
  reason?: string;
  /** User-modified safe command (optional, only for 'allow') */
  modifiedCommand?: string;
}

/**
 * Event emitted when the HITL state machine pauses.
 */
export interface HITLEvent {
  sessionId: string;
  turnNumber: number;
  action: Action;
  decision: GuardrailDecision;
  timestamp: Date;
  resolved: boolean;
}

/**
 * HITL state machine states.
 */
type HITLState = 'idle' | 'paused';

/**
 * Session terminated error — thrown when the user chooses to abort.
 */
export class SessionTerminatedError extends Error {
  override name = 'SessionTerminatedError';

  constructor(message: string = 'Session terminated by user.') {
    super(message);
  }
}

/**
 * Human-In-The-Loop state machine.
 *
 * States:
 *   IDLE → (pause) → PAUSED → (resolve) → IDLE
 *
 * Corresponds to SPEC §3.5.2.
 */
export class HITLStateMachine {
  private state: HITLState = 'idle';
  private pendingAction: Action | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private config: HITLConfig;

  private turnNumber = 0;

  /** Promise resolution for waitForResolution() */
  private resolvePromise: ((value: HITLDecision) => void) | null = null;
  private rejectPromise: ((reason: Error) => void) | null = null;

  constructor(config: HITLConfig = { timeoutMs: 300_000 }) {
    this.config = config;
  }

  /** Get the current state. */
  getState(): HITLState {
    return this.state;
  }

  /** Check if the machine is paused. */
  isPaused(): boolean {
    return this.state === 'paused';
  }

  /** Get the currently pending action (while paused). */
  getPendingAction(): Action | null {
    return this.pendingAction;
  }

  /**
   * Wait for the user to resolve the paused state.
   * Returns a Promise that resolves when `resolve()` is called,
   * or auto-denies on timeout.
   */
  waitForResolution(): Promise<HITLDecision> {
    return new Promise<HITLDecision>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  /**
   * Pause the machine — transition from IDLE to PAUSED.
   * Called when the guardrail blocks an action.
   */
  pause(action: Action, decision: GuardrailDecision): HITLEvent {
    if (this.state === 'paused') {
      throw new Error('Cannot pause: already paused. Resolve the current action first.');
    }

    this.state = 'paused';
    this.pendingAction = action;
    this.turnNumber++;

    // Start auto-deny timer
    this.startTimer();

    return {
      sessionId: '',
      turnNumber: this.turnNumber,
      action,
      decision,
      timestamp: new Date(),
      resolved: false,
    };
  }

  /**
   * Resolve the paused state with a user decision.
   * - 'allow' → return to IDLE, action proceeds
   * - 'deny' → return to IDLE, action skipped
   * - 'terminate' → throw SessionTerminatedError
   */
  resolve(action: 'allow' | 'deny' | 'terminate', modifiedCommand?: string): HITLDecision {
    if (this.state !== 'paused') {
      throw new Error('Cannot resolve: not paused.');
    }

    this.clearTimer();

    const resolvePromise = this.resolvePromise;
    const rejectPromise = this.rejectPromise;
    this.resolvePromise = null;
    this.rejectPromise = null;

    // Reset state
    this.state = 'idle';
    this.pendingAction = null;

    if (action === 'terminate') {
      const err = new SessionTerminatedError();
      if (rejectPromise) {
        rejectPromise(err);
      }
      throw err;
    }

    const result: HITLDecision = { action };
    if (modifiedCommand) {
      result.modifiedCommand = modifiedCommand;
    }

    if (resolvePromise) {
      resolvePromise(result);
    }

    return result;
  }

  /** Start the auto-deny timer. */
  private startTimer(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      // Auto-deny on timeout
      const resolvePromise = this.resolvePromise;
      this.resolvePromise = null;
      this.rejectPromise = null;
      this.state = 'idle';
      this.pendingAction = null;
      if (resolvePromise) {
        resolvePromise({ action: 'deny' });
      }
    }, this.config.timeoutMs);
  }

  /** Clear the auto-deny timer. */
  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
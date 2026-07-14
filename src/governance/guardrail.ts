import type { Action } from '../core/action-parser.js';
import { DANGER_PATTERNS, type DangerPattern } from './danger-patterns.js';

/**
 * Result of a guardrail check.
 * Corresponds to SPEC §6.1.
 */
export interface GuardrailDecision {
  allowed: boolean;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  matchedPattern?: string;
  reason?: string;
  requiresApproval: boolean;
}

/**
 * Check an action against all guardrail rules.
 * Returns a GuardrailDecision indicating whether the action is allowed.
 *
 * Check levels:
 * 1. Text responses → always allowed
 * 2. Non-shell actions → allowed (path checks handled by sandbox)
 * 3. Shell commands → check against danger patterns
 *
 * Corresponds to SPEC §3.5.1.
 */
export function checkAction(action: Action): GuardrailDecision {
  // Text responses are always safe
  if (action.type === 'text_response') {
    return { allowed: true, riskLevel: 'none', requiresApproval: false };
  }

  // Only check shell_exec for danger patterns
  if (action.toolCall?.name === 'shell_exec') {
    const command = String(action.toolCall.arguments.command ?? '');

    if (!command.trim()) {
      return { allowed: true, riskLevel: 'none', requiresApproval: false };
    }

    // Check against all danger patterns
    for (const pattern of DANGER_PATTERNS) {
      if (pattern.regex.test(command)) {
        return {
          allowed: false,
          riskLevel: pattern.riskLevel,
          matchedPattern: pattern.name,
          reason: pattern.description,
          requiresApproval: true,
        };
      }
    }
  }

  // All other cases: allowed
  return { allowed: true, riskLevel: 'none', requiresApproval: false };
}
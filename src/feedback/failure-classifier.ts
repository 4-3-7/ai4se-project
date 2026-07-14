import type { TestResult, LintResult } from './feedback-parsers.js';

/**
 * Failure categories for coding failures.
 * Corresponds to SPEC §3.6.2.
 */
export type FailureCategory =
  | 'syntax_error'
  | 'type_error'
  | 'import_error'
  | 'logic_error'
  | 'style_error'
  | 'runtime_error'
  | 'timeout_error'
  | 'unknown_error';

export interface FailureClassification {
  category: FailureCategory;
  count: number;
  items: string[];
}

// ── Classification rules (deterministic code) ──

const CLASSIFICATION_RULES: Array<{
  category: FailureCategory;
  patterns: RegExp[];
}> = [
  {
    category: 'syntax_error',
    patterns: [/SyntaxError:/i, /Unexpected token/i, /Unexpected end/i],
  },
  {
    category: 'type_error',
    patterns: [/TS\d{4}:/, /is not assignable/i, /does not exist on type/i, /cannot be used as a value/i],
  },
  {
    category: 'import_error',
    patterns: [/Cannot find module/i, /Module not found/i, /has no exported member/i],
  },
  {
    category: 'logic_error',
    patterns: [/expected/i, /assertion/i, /AssertionError/i, /to be/i, /to equal/i, /to contain/i],
  },
  {
    category: 'style_error',
    patterns: [], // Handled separately via lint issues
  },
  {
    category: 'runtime_error',
    patterns: [/Error:/i, /TypeError:/i, /ReferenceError:/i, /Cannot read propert/i, /is not a function/i],
  },
  {
    category: 'timeout_error',
    patterns: [/timeout/i, /timed out/i, /exceeded \d+ms/i],
  },
];

/**
 * Classify test and lint failures into categories.
 *
 * @param testResult - Parsed test result (null if no tests ran)
 * @param lintResult - Parsed lint result (null if no lint ran)
 * @returns Classified failures, merged by category
 */
export function classifyFailures(
  testResult: TestResult | null,
  lintResult: LintResult | null,
): FailureClassification[] {
  const map = new Map<FailureCategory, string[]>();

  // Classify test failures from failureDetails only (names are just labels)
  if (testResult && testResult.failed > 0) {
    const allDetails = testResult.failureDetails.length > 0
      ? testResult.failureDetails
      : testResult.failures;

    for (const detail of allDetails) {
      const category = classifySingle(detail);
      const existing = map.get(category);
      if (existing) {
        existing.push(detail);
      } else {
        map.set(category, [detail]);
      }
    }
  }

  // Classify lint issues as style errors
  if (lintResult && lintResult.issues.length > 0) {
    const lintItems = lintResult.issues.map(
      (i) => `${i.file}:${i.line} — ${i.message} (${i.rule})`,
    );
    const existing = map.get('style_error');
    if (existing) {
      existing.push(...lintItems);
    } else {
      map.set('style_error', lintItems);
    }
  }

  // Convert to array
  const result: FailureClassification[] = [];
  for (const [category, items] of map) {
    result.push({ category, count: items.length, items });
  }
  return result;
}

function classifySingle(detail: string): FailureCategory {
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.category === 'style_error') continue; // Style errors come from lint
    for (const pattern of rule.patterns) {
      if (pattern.test(detail)) {
        return rule.category;
      }
    }
  }
  return 'unknown_error';
}
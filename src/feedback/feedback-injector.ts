import type { FailureClassification } from './failure-classifier.js';

/**
 * Feedback check status.
 */
export interface FeedbackCheck {
  type: 'test' | 'lint' | 'typecheck' | 'exitcode';
  status: 'pass' | 'fail' | 'warn';
  details: string;
}

// Re-export for convenience
export type { FailureClassification };

/**
 * Format a structured feedback report for injection into the LLM context.
 * Corresponds to SPEC §3.6.3.
 */
export function formatFeedbackReport(
  turnNumber: number,
  checks: FeedbackCheck[],
  classifications: FailureClassification[],
): string {
  const lines: string[] = [];

  lines.push(`## Feedback Report (Turn ${turnNumber})`);
  lines.push('');

  // Summary table
  lines.push('| Check | Status | Details |');
  lines.push('|-------|--------|---------|');

  for (const check of checks) {
    const icon = statusIcon(check.status);
    const label = checkLabel(check.type);
    lines.push(`| ${label} | ${icon} ${check.status} | ${check.details} |`);
  }

  lines.push('');

  // Failure classifications
  if (classifications.length > 0) {
    lines.push('**Failure Classification:**');
    lines.push('');

    for (const c of classifications) {
      const label = categoryLabel(c.category);
      lines.push(`- \`${c.category}\` (${c.count}): ${label}`);
      for (const item of c.items.slice(0, 5)) {
        // Max 5 items per category
        lines.push(`  - ${item}`);
      }
      if (c.items.length > 5) {
        lines.push(`  - ... and ${c.items.length - 5} more`);
      }
    }

    lines.push('');
    lines.push('**Suggested Next Actions:**');
    lines.push('');

    for (const c of classifications) {
      lines.push(`${categorySuggestion(c.category)}`);
    }
  } else {
    lines.push('✅ All checks passed.');
  }

  return lines.join('\n');
}

function statusIcon(status: string): string {
  switch (status) {
    case 'pass':
      return '✅';
    case 'fail':
      return '❌';
    case 'warn':
      return '⚠️';
    default:
      return '❓';
  }
}

function checkLabel(type: string): string {
  switch (type) {
    case 'test':
      return 'Tests';
    case 'lint':
      return 'Lint';
    case 'typecheck':
      return 'Type Check';
    case 'exitcode':
      return 'Exit Code';
    default:
      return type;
  }
}

function categoryLabel(category: string): string {
  switch (category) {
    case 'syntax_error':
      return 'Syntax error in code';
    case 'type_error':
      return 'TypeScript type error';
    case 'import_error':
      return 'Module import error';
    case 'logic_error':
      return 'Test assertion failure';
    case 'style_error':
      return 'Code style / lint issue';
    case 'runtime_error':
      return 'Runtime error';
    case 'timeout_error':
      return 'Timeout';
    default:
      return 'Unclassified error';
  }
}

function categorySuggestion(category: string): string {
  switch (category) {
    case 'syntax_error':
      return '1. Fix the syntax error (check for missing brackets, semicolons, etc.)';
    case 'type_error':
      return '1. Fix the TypeScript type error (check parameter types, return types)';
    case 'import_error':
      return '1. Fix the import path or ensure the module exists';
    case 'logic_error':
      return '1. Fix the failing test assertions (check expected vs actual values)';
    case 'style_error':
      return '1. Fix lint issues (run lint to see details)';
    case 'runtime_error':
      return '1. Fix the runtime error (check for null/undefined, invalid operations)';
    case 'timeout_error':
      return '1. Check for infinite loops or performance issues causing timeout';
    default:
      return '1. Investigate the error and fix accordingly';
  }
}
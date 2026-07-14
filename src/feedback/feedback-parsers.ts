/**
 * Feedback parsers — parse test runner and lint tool outputs into structured data.
 * Corresponds to SPEC §3.6.1.
 */

// ── Types ──

export interface FeedbackCheck {
  type: 'test' | 'lint' | 'typecheck' | 'exitcode';
  status: 'pass' | 'fail' | 'warn';
  details: string;
}

export interface TestResult {
  status: 'pass' | 'fail';
  passed: number;
  failed: number;
  failures: string[];
  failureDetails: string[];
}

export interface LintIssue {
  file: string;
  line: number;
  column?: number;
  severity: 'error' | 'warning';
  message: string;
  rule: string;
}

export interface LintResult {
  status: 'pass' | 'fail' | 'warn';
  errors: number;
  warnings: number;
  issues: LintIssue[];
}

// ── Test result parser ──

/**
 * Parse test runner output (Vitest / Jest / Mocha) into a structured result.
 */
export function parseTestResult(output: string): TestResult {
  const failures: string[] = [];
  const failureDetails: string[] = [];

  // Extract individual test failures
  // Vitest/Jest: ❯ test name
  const vitestFailRe = /[❯>]\s+(.+?)(?:\s+\d+ms)?$/gm;
  let match: RegExpExecArray | null;
  while ((match = vitestFailRe.exec(output)) !== null) {
    let name = match[1]!.trim();
    // Skip summary lines
    if (name.startsWith('Test Files') || name.startsWith('Tests') || name.length === 0) {
      continue;
    }
    // Handle "file.test.ts > test name" format — extract test name
    if (name.includes('.test.ts') || name.includes('.spec.ts')) {
      const parts = name.split('>');
      if (parts.length > 1) {
        name = parts[parts.length - 1]!.trim();
      } else {
        continue; // It's a file/suite header, not a test
      }
    }
    failures.push(name);
  }

  // Extract expected vs actual
  const expectedActualRe = /→\s+(.+)/g;
  while ((match = expectedActualRe.exec(output)) !== null) {
    failureDetails.push(match[1]!.trim());
  }

  // Mocha-style: "N) test name:"
  const mochaFailRe = /^\s+\d+\)\s+(.+):$/gm;
  while ((match = mochaFailRe.exec(output)) !== null) {
    failures.push(match[1]!.trim());
  }

  // Extract pass/fail counts
  const passed = extractCount(output, /(\d+)\s+pass(?:ed|ing)/i);
  const failed = extractCount(output, /(\d+)\s+fail(?:ed|ing)/i);

  // If no counts found, try summary line
  const failCountMatch = output.match(/Tests\s+(\d+)\s+failed/i);
  const passCountMatch = output.match(/(\d+)\s+passed\s*\(/i);

  const finalPassed = passed > 0 ? passed : (passCountMatch ? parseInt(passCountMatch[1]!, 10) : 0);
  const finalFailed = failed > 0 ? failed : (failCountMatch ? parseInt(failCountMatch[1]!, 10) : 0);

  return {
    status: finalFailed > 0 ? 'fail' : 'pass',
    passed: finalPassed,
    failed: finalFailed,
    failures,
    failureDetails,
  };
}

// ── Lint result parser ──

/**
 * Parse ESLint output into a structured result.
 * Format: /path/to/file
 *            line:col   severity   message   rule
 */
export function parseLintResult(output: string): LintResult {
  const issues: LintIssue[] = [];

  if (!output.trim()) {
    return { status: 'pass', errors: 0, warnings: 0, issues: [] };
  }

  const lines = output.split('\n');
  let currentFile = '';

  for (const line of lines) {
    // File path line
    const fileMatch = line.match(/^\s{2}([\w/.-]+(?:\.\w+))\s*$/);
    if (fileMatch) {
      continue; // File path is embedded in the issue line above
    }

    // Detect file path at the start of a line (with optional leading spaces)
    const fileLineMatch = line.match(/^\s*([/\w.-]+\.\w+)\s*$/);
    if (fileLineMatch && !fileLineMatch[1]!.startsWith('✖')) {
      currentFile = fileLineMatch[1]!;
      continue;
    }

    // Issue line: "  line:col   severity   message   rule"
    const issueMatch = line.match(/^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+([\w@/.-]+)\s*$/);
    if (issueMatch) {
      // If we don't have a current file, try to extract from the output path
      // (look back for the file path which might be on a previous line)
      issues.push({
        file: currentFile || extractFileFromOutput(output, line),
        line: parseInt(issueMatch[1]!, 10),
        column: parseInt(issueMatch[2]!, 10),
        severity: issueMatch[3] as 'error' | 'warning',
        message: issueMatch[4]!.trim(),
        rule: issueMatch[5]!.trim(),
      });
    }
  }

  // Summary line: "✖ N problems (X errors, Y warnings)"
  const summaryMatch = output.match(/✖\s+(\d+)\s+problems?\s*\((\d+)\s+errors?,\s*(\d+)\s+warnings?\)/);
  const errors = summaryMatch ? parseInt(summaryMatch[2]!, 10) : issues.filter((i) => i.severity === 'error').length;
  const warnings = summaryMatch
    ? parseInt(summaryMatch[3]!, 10)
    : issues.filter((i) => i.severity === 'warning').length;

  let status: 'pass' | 'fail' | 'warn';
  if (errors > 0) {
    status = 'fail';
  } else if (warnings > 0) {
    status = 'warn';
  } else {
    status = 'pass';
  }

  return { status, errors, warnings, issues };
}

// ── Helpers ──

function extractCount(text: string, regex: RegExp): number {
  // Handle "Tests  X failed | Y passed" format
  const testsLineMatch = text.match(/Tests\s+.*?(\d+)\s+failed.*?(\d+)\s+passed/i);
  if (testsLineMatch) {
    if (regex.source.includes('fail')) return parseInt(testsLineMatch[1]!, 10);
    if (regex.source.includes('pass')) return parseInt(testsLineMatch[2]!, 10);
  }

  // Handle "Tests  Y passed" format (all passing, no failures)
  const allPassMatch = text.match(/Tests\s+(\d+)\s+passed/i);
  if (allPassMatch && regex.source.includes('pass')) {
    return parseInt(allPassMatch[1]!, 10);
  }

  const match = text.match(regex);
  return match ? parseInt(match[1]!, 10) : 0;
}

function extractFileFromOutput(output: string, currentLine: string): string {
  // Walk backwards through the output to find the file path
  const lines = output.split('\n');
  const currentIdx = lines.indexOf(currentLine);
  if (currentIdx < 0) return '';

  for (let i = currentIdx - 1; i >= 0; i--) {
    const fileMatch = lines[i]!.match(/^\s*([/\w.-]+\.\w+)\s*$/);
    if (fileMatch && !fileMatch[1]!.startsWith('✖')) {
      return fileMatch[1]!;
    }
  }
  return '';
}
import { describe, it, expect } from 'vitest';
import { parseTestResult, parseLintResult } from './feedback-parsers.js';
import type { FeedbackCheck } from './feedback-parsers.js';

// ── Test result parser ──

describe('parseTestResult', () => {
  // ── Vitest/Jest output ──

  it('should parse all-passing test output', () => {
    const output = `
      ✓ src/index.test.ts (1 test) 3ms
      ✓ src/core/action-parser.test.ts (10 tests) 7ms

      Test Files  2 passed (2)
      Tests  11 passed (11)
    `;

    const result = parseTestResult(output);

    expect(result.status).toBe('pass');
    expect(result.passed).toBe(11);
    expect(result.failed).toBe(0);
    expect(result.failures).toHaveLength(0);
  });

  it('should parse failing test output', () => {
    const output = `
      ✓ src/util.test.ts (2 tests) 5ms
      ❯ src/core/parser.test.ts (5 tests | 2 failed) 10ms
        ❯ should parse input correctly
        ❯ should handle empty input

      Test Files  1 failed | 1 passed (2)
      Tests  2 failed | 3 passed (5)
    `;

    const result = parseTestResult(output);

    expect(result.status).toBe('fail');
    expect(result.passed).toBe(3);
    expect(result.failed).toBe(2);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]).toContain('parse input correctly');
  });

  it('should extract failure details including expected vs actual', () => {
    const output = `
      ❯ src/core/parser.test.ts > should parse input
        → expected "bar" to be "foo"
        → expected 5 to be 3

      Tests  1 failed (1)
    `;

    const result = parseTestResult(output);

    expect(result.status).toBe('fail');
    expect(result.failures[0]).toContain('should parse input');
    expect(result.failureDetails).toContain('expected "bar" to be "foo"');
  });

  it('should handle empty output', () => {
    const result = parseTestResult('');

    expect(result.status).toBe('pass');
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('should handle output with no test summary line', () => {
    const output = 'Some random output without test results.';

    const result = parseTestResult(output);

    // Should not crash, return best-effort parsing
    expect(result).toBeDefined();
    expect(result.status).toBe('pass');
  });

  // ── Mocha-style output ──

  it('should parse mocha-style pass/fail output', () => {
    const output = `
      3 passing (150ms)
      1 failing

      1) Parser should parse input:
         AssertionError: expected 'bar' to equal 'foo'
    `;

    const result = parseTestResult(output);

    expect(result.status).toBe('fail');
    expect(result.passed).toBe(3);
    expect(result.failed).toBe(1);
    expect(result.failures[0]).toContain('Parser should parse input');
  });
});

// ── Lint result parser ──

describe('parseLintResult', () => {
  it('should parse ESLint output with errors and warnings', () => {
    const output = `
      /project/src/parser.ts
        12:5   error    Unexpected any  @typescript-eslint/no-explicit-any
        45:10  warning  Unused variable 'x'  @typescript-eslint/no-unused-vars

      /project/src/utils.ts
        3:1   error    Missing semicolon  semi

      ✖ 3 problems (2 errors, 1 warning)
    `;

    const result = parseLintResult(output);

    expect(result.status).toBe('fail');
    expect(result.errors).toBe(2);
    expect(result.warnings).toBe(1);
    expect(result.issues).toHaveLength(3);
    expect(result.issues[0]!.file).toBe('/project/src/parser.ts');
    expect(result.issues[0]!.line).toBe(12);
    expect(result.issues[0]!.severity).toBe('error');
    expect(result.issues[0]!.rule).toBe('@typescript-eslint/no-explicit-any');
    expect(result.issues[0]!.message).toContain('Unexpected any');
  });

  it('should parse clean lint output', () => {
    const output = '';

    const result = parseLintResult(output);

    expect(result.status).toBe('pass');
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(0);
    expect(result.issues).toHaveLength(0);
  });

  it('should handle output with only warnings', () => {
    const output = `
      /project/src/old.ts
        5:3  warning  'oldFunc' is defined but never used  no-unused-vars

      ✖ 1 problem (0 errors, 1 warning)
    `;

    const result = parseLintResult(output);

    expect(result.status).toBe('warn');
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(1);
  });
});
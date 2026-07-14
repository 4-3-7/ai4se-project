import { describe, it, expect } from 'vitest';
import { classifyFailures } from './failure-classifier.js';
import type { TestResult, LintResult } from './feedback-parsers.js';

describe('classifyFailures', () => {
  it('should classify test assertion failures as LOGIC_ERROR', () => {
    const testResult: TestResult = {
      status: 'fail',
      passed: 3,
      failed: 1,
      failures: ['should return correct value'],
      failureDetails: ['expected "foo" to be "bar"'],
    };

    const result = classifyFailures(testResult, null);

    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe('logic_error');
    expect(result[0]!.count).toBe(1);
  });

  it('should classify type errors as TYPE_ERROR', () => {
    const testResult: TestResult = {
      status: 'fail',
      passed: 0,
      failed: 1,
      failures: ['src/parser.ts compilation'],
      failureDetails: ["TS2345: Argument of type 'string' is not assignable to parameter of type 'number'."],
    };

    const result = classifyFailures(testResult, null);

    expect(result[0]!.category).toBe('type_error');
  });

  it('should classify syntax errors as SYNTAX_ERROR', () => {
    const testResult: TestResult = {
      status: 'fail',
      passed: 0,
      failed: 1,
      failures: ['should compile'],
      failureDetails: ['SyntaxError: Unexpected token }'],
    };

    const result = classifyFailures(testResult, null);

    expect(result[0]!.category).toBe('syntax_error');
  });

  it('should classify import errors as IMPORT_ERROR', () => {
    const testResult: TestResult = {
      status: 'fail',
      passed: 0,
      failed: 1,
      failures: ['should import module'],
      failureDetails: ["Cannot find module './missing' or its corresponding type declarations."],
    };

    const result = classifyFailures(testResult, null);

    expect(result[0]!.category).toBe('import_error');
  });

  it('should classify lint issues as STYLE_ERROR', () => {
    const lintResult: LintResult = {
      status: 'fail',
      errors: 2,
      warnings: 1,
      issues: [
        { file: 'src/a.ts', line: 1, severity: 'error', message: 'Missing semicolon', rule: 'semi' },
        { file: 'src/b.ts', line: 3, severity: 'error', message: 'Unused var', rule: 'no-unused-vars' },
        { file: 'src/c.ts', line: 5, severity: 'warning', message: 'Line too long', rule: 'max-len' },
      ],
    };

    const result = classifyFailures(null, lintResult);

    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe('style_error');
    expect(result[0]!.count).toBe(3); // 2 errors + 1 warning
  });

  it('should merge same-category failures from both test and lint', () => {
    const testResult: TestResult = {
      status: 'fail',
      passed: 1,
      failed: 2,
      failures: ['test a', 'test b'],
      failureDetails: ['expected 1 to be 2', 'expected 3 to be 4'],
    };

    const lintResult: LintResult = {
      status: 'warn',
      errors: 0,
      warnings: 2,
      issues: [
        { file: 'src/x.ts', line: 1, severity: 'warning', message: 'a', rule: 'r1' },
        { file: 'src/y.ts', line: 2, severity: 'warning', message: 'b', rule: 'r2' },
      ],
    };

    const result = classifyFailures(testResult, lintResult);

    const logicErrors = result.filter((c) => c.category === 'logic_error');
    const styleErrors = result.filter((c) => c.category === 'style_error');

    expect(logicErrors).toHaveLength(1);
    expect(logicErrors[0]!.count).toBe(2);
    expect(styleErrors).toHaveLength(1);
    expect(styleErrors[0]!.count).toBe(2);
  });

  it('should return empty array when all pass', () => {
    const testResult: TestResult = {
      status: 'pass',
      passed: 5,
      failed: 0,
      failures: [],
      failureDetails: [],
    };

    const result = classifyFailures(testResult, null);

    expect(result).toHaveLength(0);
  });

  it('should classify runtime errors', () => {
    const testResult: TestResult = {
      status: 'fail',
      passed: 0,
      failed: 1,
      failures: ['should not crash'],
      failureDetails: ['Error: Cannot read properties of undefined'],
    };

    const result = classifyFailures(testResult, null);

    expect(result[0]!.category).toBe('runtime_error');
  });

  it('should classify unknown errors as fallback', () => {
    const testResult: TestResult = {
      status: 'fail',
      passed: 0,
      failed: 1,
      failures: ['mysterious failure'],
      failureDetails: ['Some weird output that does not match any pattern.'],
    };

    const result = classifyFailures(testResult, null);

    expect(result[0]!.category).toBe('unknown_error');
  });
});
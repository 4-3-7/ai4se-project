import { describe, it, expect } from 'vitest';
import { formatFeedbackReport } from './feedback-injector.js';
import type { FailureClassification, FeedbackCheck } from './feedback-injector.js';

describe('formatFeedbackReport', () => {
  it('should format a report with failed tests and lint warnings', () => {
    const checks: FeedbackCheck[] = [
      { type: 'test', status: 'fail', details: '2/5 tests failed' },
      { type: 'lint', status: 'warn', details: '3 warnings' },
      { type: 'typecheck', status: 'pass', details: 'No type errors' },
    ];

    const classifications: FailureClassification[] = [
      {
        category: 'logic_error',
        count: 2,
        items: ['test_parse_input: expected "foo" but got "bar"', 'test_validate: expected exception not thrown'],
      },
      {
        category: 'style_error',
        count: 3,
        items: ["'x' is unused", "'y' is unused", "'z' is unused"],
      },
    ];

    const report = formatFeedbackReport(3, checks, classifications);

    expect(report).toContain('## Feedback Report');
    expect(report).toContain('Turn 3');
    expect(report).toContain('Tests');
    expect(report).toContain('❌');
    expect(report).toContain('2/5 tests failed');
    expect(report).toContain('Lint');
    expect(report).toContain('⚠️');
    expect(report).toContain('Type Check');
    expect(report).toContain('✅');
    expect(report).toContain('logic_error');
    expect(report).toContain('style_error');
    expect(report).toContain('test_parse_input');
    expect(report).toContain('Suggested Next Actions');
  });

  it('should format a report with all checks passing', () => {
    const checks: FeedbackCheck[] = [
      { type: 'test', status: 'pass', details: '5/5 passed' },
      { type: 'lint', status: 'pass', details: 'No issues' },
      { type: 'typecheck', status: 'pass', details: 'No errors' },
    ];

    const report = formatFeedbackReport(1, checks, []);

    expect(report).toContain('✅ All checks passed');
    expect(report).not.toContain('Suggested Next Actions');
  });

  it('should include suggested next actions for failures', () => {
    const checks: FeedbackCheck[] = [
      { type: 'test', status: 'fail', details: '1/3 failed' },
    ];

    const classifications: FailureClassification[] = [
      {
        category: 'syntax_error',
        count: 1,
        items: ['Missing semicolon at line 42'],
      },
    ];

    const report = formatFeedbackReport(5, checks, classifications);

    expect(report).toContain('Syntax error in code');
    expect(report).toContain('Fix the syntax error');
  });

  it('should handle empty classifications', () => {
    const checks: FeedbackCheck[] = [
      { type: 'test', status: 'fail', details: '1/3 failed' },
    ];

    const report = formatFeedbackReport(2, checks, []);

    expect(report).toContain('Feedback Report');
    // Should not crash with empty classifications
  });
});
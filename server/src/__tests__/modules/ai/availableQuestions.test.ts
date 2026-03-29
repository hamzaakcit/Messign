import { describe, expect, it } from 'vitest';
import { getAvailableQuestionsForRole } from '../../../services/ai/tools/availableQuestions.js';

describe('getAvailableQuestionsForRole', () => {
  it('includes manager prompts for admin (not employee-only)', () => {
    const qs = getAvailableQuestionsForRole('admin');
    expect(qs).toContain('What needs my approval?');
    expect(qs).toContain('How do all teams compare this month?');
    expect(qs).toContain('Give me a system-wide overview');
    expect(qs).toContain('What is the company-wide financial summary this month?');
  });

  it('includes department report phrasings and shortened Reports Hub line for admin', () => {
    const qs = getAvailableQuestionsForRole('admin');
    expect(qs).toContain('Give me an executive summary');
    expect(qs).toContain('Give me a department report or company report');
    expect(qs).toContain('Prepare data for the board meeting');
    expect(qs).toContain('What kinds of reports can I generate in the Reports Hub?');
  });

  it('includes department and Reports Hub lines for cpo like admin', () => {
    const cpoQs = getAvailableQuestionsForRole('cpo');
    expect(cpoQs).toContain('Give me a department report or company report');
    expect(cpoQs).toContain('What kinds of reports can I generate in the Reports Hub?');
  });

  it('includes manager prompts for finance role', () => {
    const qs = getAvailableQuestionsForRole('finance');
    expect(qs).toContain('What needs my approval?');
    expect(qs).not.toContain('Give me a system-wide overview');
  });

  it('employee list is smaller than manager', () => {
    const emp = getAvailableQuestionsForRole('employee');
    const mgr = getAvailableQuestionsForRole('manager');
    expect(mgr.length).toBeGreaterThan(emp.length);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildShortDepartmentReportSummary,
  computeDepartmentReportAggregates,
} from '../../../services/ai/tools/departmentReportAggregates.js';

describe('departmentReportAggregates', () => {
  it('rolls up section metrics', () => {
    const report = {
      people: { active: 8, total_employees: 10, new_hires: 1 },
      projects: {
        id: '3a733025-e96b-4ee4-9b8a-4fb6423ad4b7',
        active: 4,
        total: 5,
        completed_period: 12,
        overdue: 1,
      },
      finance: { total_amount: '1500.5', pending_count: 2 },
      knowledge: { total_docs: 20 },
      activity: { total: 99 },
    };
    expect(computeDepartmentReportAggregates(report)).toMatchObject({
      activeEmployees: 8,
      activeProjects: 4,
      reimbursementTotal: 1500.5,
      pendingReimbursementCount: 2,
      knowledgeDocs: 20,
      periodActions: 99,
    });
  });

  it('buildShortDepartmentReportSummary avoids markdown', () => {
    const agg = {
      activeEmployees: 1,
      activeProjects: 2,
      reimbursementTotal: 100,
      pendingReimbursementCount: 0,
      knowledgeDocs: 3,
      periodActions: 4,
    };
    const s = buildShortDepartmentReportSummary('this_quarter', agg);
    expect(s).toMatch(/Executive report \(this quarter\)/);
    expect(s).not.toContain('**');
  });
});

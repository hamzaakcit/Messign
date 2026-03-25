import { describe, it, expect } from 'vitest';
import {
  buildFunnelChartDataFromMetrics,
  funnelBucketForKanbanStage,
  RECRUITMENT_KANBAN_STAGES,
} from '@/pages/recruitment/stages';

describe('recruitment stages', () => {
  it('RECRUITMENT_KANBAN_STAGES has 8 columns', () => {
    expect(RECRUITMENT_KANBAN_STAGES).toHaveLength(8);
  });

  it('funnelBucketForKanbanStage maps interview substages to interviewing', () => {
    expect(funnelBucketForKanbanStage('phone_screen')).toBe('interviewing');
    expect(funnelBucketForKanbanStage('interview')).toBe('interviewing');
    expect(funnelBucketForKanbanStage('applied')).toBe('applied');
    expect(funnelBucketForKanbanStage('hired')).toBe('hired');
  });

  it('buildFunnelChartDataFromMetrics reads pipeline keys', () => {
    const rows = buildFunnelChartDataFromMetrics({
      applied: 10,
      screening: 5,
      interviewing: 3,
      offer: 1,
      hired: 1,
    });
    expect(rows.map((r) => r.name)).toEqual(['Applied', 'Screening', 'Interviewing', 'Offer', 'Hired']);
    expect(rows.map((r) => r.value)).toEqual([10, 5, 3, 1, 1]);
  });
});

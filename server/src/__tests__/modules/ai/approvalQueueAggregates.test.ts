import { describe, expect, it } from 'vitest';
import {
  buildShortApprovalQueueSummary,
  computeApprovalQueueAggregates,
  itemsFromApprovalQueueData,
} from '../../../services/ai/tools/approvalQueueAggregates.js';

const REF_ROW_ID = '3a733025-e96b-4ee4-9b8a-4fb6423ad4b7';

describe('approvalQueueAggregates', () => {
  it('computes byType counts', () => {
    const items = [
      { type: 'reimbursement', id: REF_ROW_ID, title: 'Trip', detail: 'x', date: '2025-01-01' },
      { type: 'document', id: 'b', title: 'Policy', detail: 'y', date: '2025-01-02' },
      { type: 'invoice', id: 'c', detail: 'z', title: 'Inv', date: '2025-01-03' },
    ];
    expect(computeApprovalQueueAggregates(items)).toEqual({
      total: 3,
      byType: { reimbursement: 1, document: 1, invoice: 1 },
    });
  });

  it('normalizes legacy array and object payloads', () => {
    const legacy = [{ type: 'reimbursement', id: 'x', title: 'T', detail: '', date: '' }];
    expect(itemsFromApprovalQueueData(legacy).aggregates.total).toBe(1);
    const structured = {
      items: legacy,
      aggregates: { total: 1, byType: { reimbursement: 1, document: 0, invoice: 0 } },
    };
    expect(itemsFromApprovalQueueData(structured).aggregates.byType.reimbursement).toBe(1);
  });

  it('buildShortApprovalQueueSummary avoids markdown', () => {
    const agg = { total: 0, byType: { reimbursement: 0, document: 0, invoice: 0 } };
    expect(buildShortApprovalQueueSummary([], agg)).toContain('caught up');
    const agg2 = computeApprovalQueueAggregates([
      { type: 'reimbursement', id: '1', title: '', detail: '', date: '' },
      { type: 'reimbursement', id: '2', title: '', detail: '', date: '' },
    ]);
    const s = buildShortApprovalQueueSummary([], agg2);
    expect(s).toMatch(/2 pending items/);
    expect(s).not.toContain('**');
  });
});

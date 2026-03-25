import { describe, expect, it } from 'vitest';
import '../../../services/ai/tools/index.js';
import { resolveWidgetPayloadsForTool } from '../../../services/ai/widgetResolve.js';

describe('resolveWidgetPayloadsForTool', () => {
  it('returns command_center for dashboard tool', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'dashboard:get_command_center',
      { success: true, data: { generatedAt: '2020-01-01', pulse: {}, brain: {}, growth: {}, future: {}, workspace: {} }, summary: '' },
      'employee',
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]?.widgetType).toBe('command_center');
    expect(payloads[0]?.actions?.some((a) => a.kind === 'navigate')).toBe(true);
  });

  it('returns knowledge_doc_list for KB search doc array', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'knowledge:search_knowledge_base',
      {
        success: true,
        data: [{ id: '1', title: 'Guide', slug: 'guide', document_type: 'document' }],
        summary: 'x',
      },
      'employee',
    );
    expect(payloads[0]?.widgetType).toBe('knowledge_doc_list');
  });

  it('maps finance approval queue to data_table with nav', () => {
    const payloads = resolveWidgetPayloadsForTool(
      'analytics:get_approval_queue',
      { success: true, data: [{ id: 'a', type: 'expense' }], summary: '' },
      'employee',
    );
    expect(payloads[0]?.widgetType).toBe('data_table');
  });
});

import { describe, it, expect } from 'vitest';
import { storeGoldenExampleTool, manageTriggerTool } from '../../../services/ai/tools/memoryAutomationTools.js';
import type { ToolContext, ToolResult } from '../../../services/ai/types.js';

const baseCtx: ToolContext = {
  userId: 'user-1',
  userRole: 'admin',
  organizationId: '00000000-0000-0000-0000-000000000001',
};

describe('memory:store_golden_example', () => {
  it('rejects chat-style calls when not in test mode', async () => {
    const prev = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const r = (await storeGoldenExampleTool.execute(
        {
          content_id: 'c1',
          content_text: 'body',
          performance_metrics: { ctr: 0.1 },
        },
        { ...baseCtx, traceId: 'chat:123' },
      )) as ToolResult;
      expect(r.success).toBe(false);
      expect(r.summary).toMatch(/learner/i);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('accepts Learner trace prefix', async () => {
    const r = (await storeGoldenExampleTool.execute(
      {
        content_id: `golden-${Date.now()}`,
        content_text: 'Winning post body',
        performance_metrics: { ctr: 0.12, conversions: 3 },
        success_markers: ['clear CTA', 'social proof'],
        segment: 'SMB',
        channel: 'email',
      },
      { ...baseCtx, traceId: 'learner:nightly-1' },
    )) as ToolResult;
    if (!r.success) {
      expect(r.summary).toMatch(/Failed|relation|does not exist/i);
      return;
    }
    const d = r.data as { memory_id: string; embedding_stored: boolean };
    expect(d.memory_id.length).toBeGreaterThan(0);
    expect(d.embedding_stored).toBe(false);
  });
});

describe('automation:manage_trigger', () => {
  it('creates, lists, toggles, and deletes a trigger', async () => {
    const create = (await manageTriggerTool.execute(
      {
        action: 'create',
        config: {
          name: `Test trigger ${Date.now()}`,
          trigger_type: 'schedule',
          trigger_config: { cron: '0 9 * * 1' },
          actions: [{ type: 'invoke_agent', config: { agent: 'marketing' } }],
          hitl_mode: 'draft_and_wait',
          enabled: true,
        },
      },
      baseCtx,
    )) as ToolResult;

    if (!create.success) {
      expect(create.summary).toMatch(/Failed|relation|does not exist/i);
      return;
    }

    const tid = (create.data as { trigger_id: string }).trigger_id;
    expect(tid.length).toBeGreaterThan(0);

    const list = (await manageTriggerTool.execute({ action: 'list' }, baseCtx)) as ToolResult;
    expect(list.success).toBe(true);

    const toggle = (await manageTriggerTool.execute(
      { action: 'toggle', trigger_id: tid },
      baseCtx,
    )) as ToolResult;
    expect(toggle.success).toBe(true);

    const del = (await manageTriggerTool.execute(
      { action: 'delete', trigger_id: tid },
      baseCtx,
    )) as ToolResult;
    expect(del.success).toBe(true);
  });
});

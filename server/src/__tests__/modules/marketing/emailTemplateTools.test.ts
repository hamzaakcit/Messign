import { describe, it, expect, vi } from 'vitest';
import {
  extractStyleHintsFromBodyDesign,
  getSavedEmailDesign,
  listSavedEmailDesigns,
} from '../../../modules/marketing/tools/emailTemplateTools.js';
import type { ToolContext, ToolResult } from '../../../services/ai/types.js';

vi.mock('../../../services/ai/tools/resolveOrgIdForTool.js', () => ({
  resolveOrgIdForTool: vi.fn().mockResolvedValue('00000000-0000-0000-0000-000000000001'),
}));

vi.mock('../../../dal/marketing/content.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../dal/marketing/content.js')>()),
  listRecentEmailContentWithVisuals: vi.fn().mockResolvedValue([]),
}));

describe('emailTemplateTools', () => {
  it('extractStyleHintsFromBodyDesign collects hex colors', () => {
    const hints = extractStyleHintsFromBodyDesign({
      body: {
        rows: [{ values: { backgroundColor: '#0a0a0a' }, columns: [{ values: { backgroundColor: '#ff00ff' } }] }],
      },
    });
    expect(hints).toContain('#0a0a0a');
    expect(hints).toContain('#ff00ff');
  });

  it('listSavedEmailDesigns returns array data when org context resolves', async () => {
    const r = (await listSavedEmailDesigns.handler(
      { limit: 5 },
      {
        userId: 'u1',
        userRole: 'admin',
        organizationId: '00000000-0000-0000-0000-000000000001',
      } as ToolContext,
    )) as ToolResult;
    expect(r.success).toBe(true);
    expect(Array.isArray(r.data)).toBe(true);
  });

  it('getSavedEmailDesign requires content_id', async () => {
    const r = (await getSavedEmailDesign.handler(
      { content_id: '' },
      {
        userId: 'u1',
        userRole: 'admin',
        organizationId: '00000000-0000-0000-0000-000000000001',
      } as ToolContext,
    )) as ToolResult;
    expect(r.success).toBe(false);
  });
});

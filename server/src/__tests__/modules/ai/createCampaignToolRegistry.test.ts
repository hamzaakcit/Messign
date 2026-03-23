import { describe, it, expect } from 'vitest';
import '../../../services/ai/tools/createCampaignTool.js';
import { getLLMToolsForExactNames } from '../../../services/ai/toolRegistry.js';

describe('marketing:create_campaign registry', () => {
  it('is included in getLLMToolsForExactNames for allowed roles', () => {
    const tools = getLLMToolsForExactNames(['marketing:create_campaign'], ['admin']);
    expect(tools.length).toBe(1);
    expect(tools[0]?.type).toBe('function');
    expect(tools[0]?.function?.name).toBe('marketing:create_campaign');
  });

  it('is omitted when user lacks required role', () => {
    const tools = getLLMToolsForExactNames(['marketing:create_campaign'], ['employee']);
    expect(tools.length).toBe(0);
  });
});

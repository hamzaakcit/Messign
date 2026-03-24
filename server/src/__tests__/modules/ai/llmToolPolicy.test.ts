import '../../../services/ai/tools/index.js';
import { isDisallowedToolForLlmDiscovery } from '../../../services/ai/tools/llmToolPolicy.js';
import { getToolIndex, selectTools } from '../../../services/ai/v2/tools/toolSelector.js';

describe('llmToolPolicy + toolSelector', () => {
  it('isDisallowedToolForLlmDiscovery flags finance write tools', () => {
    expect(isDisallowedToolForLlmDiscovery('finance:draft_invoice')).toBe(true);
    expect(isDisallowedToolForLlmDiscovery('marketing:create_campaign')).toBe(true);
  });

  it('isDisallowedToolForLlmDiscovery allows read tools', () => {
    expect(isDisallowedToolForLlmDiscovery('finance:get_financial_summary')).toBe(false);
    expect(isDisallowedToolForLlmDiscovery('analytics:get_system_stats')).toBe(false);
  });

  it('selectTools strips disallowed names from override list', () => {
    const tools = selectTools('analytics', ['finance:draft_invoice', 'analytics:get_system_stats']);
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('finance:draft_invoice');
    expect(names).toContain('analytics:get_system_stats');
    expect(names.some((n) => n.startsWith('core:'))).toBe(true);
  });

  it('getToolIndex omits finance:draft_invoice when registered', () => {
    const idx = getToolIndex();
    const hit = idx.find((e) => e.name === 'finance:draft_invoice');
    expect(hit).toBeUndefined();
  });
});

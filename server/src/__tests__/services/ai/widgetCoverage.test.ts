import { describe, expect, it } from 'vitest';
import '../../../services/ai/tools/index.js';
import { BASE_TOOLS, DOMAIN_TOOL_MAP } from '../../../services/ai/v2/tools/toolSelector.js';
import { getTool } from '../../../services/ai/toolRegistry.js';
import { hasWidgetCoverage } from '../../../services/ai/widgetContracts.js';

/** Ensures every tool registered for Dora v2 agent discovery has a widget path or explicit text-only waiver. */
describe('curated Dora tools widget coverage', () => {
  const curated = new Set<string>([...BASE_TOOLS, ...Object.values(DOMAIN_TOOL_MAP).flat()]);

  it('each registered curated tool name hasWidgetCoverage', () => {
    for (const name of curated) {
      const t = getTool(name);
      if (!t) continue;
      expect(hasWidgetCoverage(name), `${name} should be mapped, special-cased, or text-only`).toBe(true);
    }
  });
});

/**
 * Optional live integration: `MARKETING_ORCHESTRATOR_LIVE=1 npx vitest run src/__tests__/modules/marketing/marketingOrchestrator.live.test.ts`
 * Requires ANTHROPIC_API_KEY. Not run in CI by default.
 */
import { describe, it, expect } from 'vitest';
import { routeMarketingRequest } from '../../../services/ai/marketing/marketingRouterJsonOrchestrator.js';

const live = process.env.MARKETING_ORCHESTRATOR_LIVE === '1';

describe.skipIf(!live)('routeMarketingRequest (live Claude)', () => {
  it('returns a valid route for a content request', async () => {
    const result = await routeMarketingRequest(
      'Write a short LinkedIn post about our API.',
      'live-test-workspace',
      'live-test-session',
    );
    expect(['CONTENT_STRATEGIST', 'CAMPAIGN_MANAGER', 'BOTH', 'NONE']).toContain(result.route);
    expect(result.reasoning.length).toBeGreaterThan(0);
  });
});

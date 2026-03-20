/**
 * Nightly Learner stub: call with ORG_ID + DATABASE_URL. Uses traceId learner:nightly for gated tools.
 *
 * Example:
 *   ORG_ID=<uuid> npx tsx src/scripts/marketing/nightlyLearnerPipeline.ts
 */
import { executeTool } from '../../services/ai/toolRegistry.js';
import type { ToolContext } from '../../services/ai/types.js';

async function main(): Promise<void> {
  const organizationId = process.env.ORG_ID?.trim();
  if (!organizationId) {
    console.error('Set ORG_ID to a valid organization UUID.');
    process.exit(1);
  }

  const ctx: ToolContext = {
    userId: process.env.LEARNER_USER_ID?.trim() || 'learner-job',
    userRole: 'admin',
    organizationId,
    traceId: 'learner:nightly',
  };

  const golden = await executeTool(
    'memory:store_golden_example',
    {
      content_id: `nightly-placeholder-${Date.now()}`,
      content_text: 'Placeholder body for pipeline smoke test — replace with real winning content from analytics.',
      performance_metrics: { source: 'nightly_stub' },
      success_markers: ['pipeline_ok'],
    },
    ctx,
  );
  console.log('[Learner] memory:store_golden_example', golden.success, golden.summary);

  const proposal = await executeTool(
    'marketing:propose_brand_voice_patch',
    {
      rationale: 'Nightly Learner: propose reviewing top-performing snippets from last period (stub).',
      tone_notes: ['Reinforce clarity over hype when metrics support it.'],
    },
    ctx,
  );
  console.log('[Learner] marketing:propose_brand_voice_patch', proposal.success, proposal.summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

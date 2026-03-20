/**
 * Prints compiled product-truth and brand-voice Markdown for a workspace.
 *
 * Usage:
 *   npx tsx src/scripts/printMarketingContext.ts [workspace_uuid]
 *   WORKSPACE_ID=uuid npx tsx src/scripts/printMarketingContext.ts
 *
 * Requires: migration 072 applied; DATABASE_URL set.
 */
import 'dotenv/config';
import { query } from '../db/index.js';
import {
  buildBrandVoiceProfile,
  buildProductTruthSheet,
  invalidateWorkspaceMarketingContext,
} from '../services/marketing/marketingContextCompiler.js';

async function resolveWorkspaceId(): Promise<string> {
  const fromEnv = process.env.WORKSPACE_ID?.trim();
  const fromArg = process.argv[2]?.trim();
  if (fromEnv) return fromEnv;
  if (fromArg) return fromArg;
  const r = await query<{ id: string }>(`SELECT id::text AS id FROM organizations ORDER BY created_at ASC NULLS LAST LIMIT 1`);
  if (!r.rows[0]?.id) {
    throw new Error('No organizations in DB; pass WORKSPACE_ID or create an org.');
  }
  console.log(`(using first organization ${r.rows[0].id} — pass WORKSPACE_ID or argv to override)\n`);
  return r.rows[0].id;
}

async function main(): Promise<void> {
  const workspaceId = await resolveWorkspaceId();

  invalidateWorkspaceMarketingContext(workspaceId);

  console.log('======== PRODUCT TRUTH SHEET ========\n');
  const product = await buildProductTruthSheet(workspaceId);
  console.log(product);

  console.log('\n======== BRAND VOICE PROFILE ========\n');
  const brand = await buildBrandVoiceProfile(workspaceId);
  console.log(brand);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

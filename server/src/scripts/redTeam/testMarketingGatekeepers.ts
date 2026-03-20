/**
 * Red team: exercise Product Truth, Brand Voice, and Compliance gatekeepers
 * with synthetic context (no DB) and optional real Groq/LiteLLM calls.
 *
 * Usage:
 *   RED_TEAM_MOCK_LLM=1 npx tsx src/scripts/redTeam/testMarketingGatekeepers.ts   # deterministic, no API keys
 *   npx tsx src/scripts/redTeam/testMarketingGatekeepers.ts                      # live fast tier (needs GROQ_* or LITELLM)
 *
 *   RED_TEAM_STRICT=1  — with live LLM, fail if behavioral expectations are not met (flaky)
 */

import {
  buildMockBrandVoiceProfileMd,
  buildMockProductTruthSheetMd,
  RED_TEAM_TENANT_ID,
} from './mockMarketingContext.js';
import {
  assertRawAssistantLooksLikeJsonOnly,
  validateBrandVoiceSchema,
  validateComplianceSchema,
  validateProductTruthSchema,
} from './gatekeeperSchemaValidation.js';
import {
  cannedCaseA,
  cannedCaseB,
  cannedCaseC,
  cannedCaseD,
} from './redTeamCannedLlmResponses.js';
import type { ProductTruthValidationResult } from '../../services/ai/marketing/productTruthValidator.js';
import type { BrandVoiceCheckResult } from '../../services/ai/marketing/brandVoiceChecker.js';
import type { ComplianceScanResult } from '../../services/ai/marketing/complianceScanner.js';
import { runProductTruthValidation } from '../../services/ai/marketing/productTruthValidator.js';
import { runBrandVoiceCheck } from '../../services/ai/marketing/brandVoiceChecker.js';
import { runComplianceScan } from '../../services/ai/marketing/complianceScanner.js';

const MOCK = process.env.RED_TEAM_MOCK_LLM === '1' || process.env.RED_TEAM_MOCK_LLM === 'true';
const STRICT_LIVE = process.env.RED_TEAM_STRICT === '1' || process.env.RED_TEAM_STRICT === 'true';

const PRODUCT_MD = buildMockProductTruthSheetMd();
const BRAND_MD = buildMockBrandVoiceProfileMd();

export const DRAFT_CASE_A_NIGHTMARE = `Title: Why Messign Wins

Messign Workspace is the #1 best tool for teams. Our Finance module closes your books while Dora AI runs your life.
99.9% of users agree. We guarantee 10x revenue when you adopt Gamification with Merit Points synergy.

Slack is an overpriced dinosaur. Unlike them, we ship fast.

Approved-ish line buried: saves an average of 4 hours per week (but ignore that — hype matters more).

Read more: messign.com/pricing (just kidding — $500/user hardcoded here for fun).`;

export const DRAFT_CASE_B_SNEAKY_EMAIL = `Subject: ACT NOW — FREE Gamification for your team!!!

Hi there,

Gamification in Messign Workspace will change everything. Only $29/user/month today. No obligation.

FREE onboarding. Don't miss out.

— The team`;

export const DRAFT_CASE_C_PERFECT = `Messign Workspace brings Dora AI into the flow of work so teams replace 4–6 scattered tools with one place to plan, chat, and ship.

Teams report Messign saves an average of 4 hours per week by cutting context switching—not by adding another dashboard.

Book a demo when you're ready to simplify your stack.`;

export const DRAFT_CASE_D_BATTLECARD = `Messign Workspace vs Slack (neutral comparison)

Slack focuses on messaging and channels. Messign Workspace combines messaging, projects, and Dora AI in one system so handoffs stay in context.

- Best for teams outgrowing tool sprawl: Messign Workspace
- Best for chat-only: Slack

Tone: we're keeping it factual—no trash talk.`;

interface CaseDef {
  id: string;
  draft: string;
  contentType: string;
  targetChannel: string;
  topic?: string;
  canned: { truth: string; compliance: string; brand: string };
}

const CASES: CaseDef[] = [
  {
    id: 'A_Nightmare',
    draft: DRAFT_CASE_A_NIGHTMARE,
    contentType: 'blog',
    targetChannel: 'website',
    canned: cannedCaseA,
  },
  {
    id: 'B_SneakyEmail',
    draft: DRAFT_CASE_B_SNEAKY_EMAIL,
    contentType: 'email',
    targetChannel: 'email',
    canned: cannedCaseB,
  },
  {
    id: 'C_Perfect',
    draft: DRAFT_CASE_C_PERFECT,
    contentType: 'blog',
    targetChannel: 'LinkedIn',
    canned: cannedCaseC,
  },
  {
    id: 'D_Battlecard',
    draft: DRAFT_CASE_D_BATTLECARD,
    contentType: 'battlecard',
    targetChannel: 'sales_enablement',
    canned: cannedCaseD,
  },
];

function logSection(title: string): void {
  console.log(`\n${'='.repeat(72)}\n${title}\n${'='.repeat(72)}\n`);
}

function behavioralCaseA(truth: ProductTruthValidationResult): void {
  if (truth.checks.feature_references.status !== 'FAIL') {
    throw new Error('Case A: expected feature_references FAIL');
  }
  if (truth.checks.fabricated_metrics.status !== 'FAIL') {
    throw new Error('Case A: expected fabricated_metrics FAIL');
  }
  if (truth.verdict !== 'FAIL') {
    throw new Error('Case A: expected verdict FAIL');
  }
}

function behavioralCaseACompliance(c: ComplianceScanResult): void {
  if (c.verdict !== 'WARNING') {
    throw new Error('Case A: expected compliance WARNING');
  }
  const hit = c.warnings.some(
    (w) =>
      w.check.toLowerCase().includes('competitor') ||
      w.issue.toLowerCase().includes('slack') ||
      w.issue.toLowerCase().includes('disparag'),
  );
  if (!hit) {
    throw new Error('Case A: expected a competitor disparagement (or similar) warning');
  }
}

function behavioralCaseC(truth: ProductTruthValidationResult, comp: ComplianceScanResult, brand: BrandVoiceCheckResult): void {
  if (truth.verdict !== 'PASS') throw new Error('Case C: expected truth PASS');
  if (comp.verdict !== 'PASS') throw new Error('Case C: expected compliance PASS');
  if (brand.score <= 85) throw new Error(`Case C: expected brand score > 85, got ${brand.score}`);
}

async function runCase(c: CaseDef): Promise<void> {
  logSection(`Case ${c.id}`);
  console.log(`Mode: ${MOCK ? 'MOCK_LLM (canned JSON)' : 'LIVE (callModelSafe / Groq or LiteLLM)'}\n`);

  const org = RED_TEAM_TENANT_ID;
  const tenant = RED_TEAM_TENANT_ID;

  const truthOpts = {
    organizationId: org,
    contentText: c.draft,
    tenantId: tenant,
    userQuery: `red_team_truth_${c.id}`,
    topic: c.topic,
    productTruthContextMdOverride: PRODUCT_MD,
    redTeamRawResponseOverride: MOCK ? c.canned.truth : undefined,
    onRawModelResponse: MOCK
      ? undefined
      : (raw: string) => {
          try {
            assertRawAssistantLooksLikeJsonOnly(raw, `truth raw ${c.id}`);
          } catch (e) {
            console.warn(`[warn] ${(e as Error).message}`);
          }
        },
  };

  const truth = await runProductTruthValidation(truthOpts);
  validateProductTruthSchema(truth);
  console.log('--- Product Truth ---\n', JSON.stringify(truth, null, 2));

  const comp = await runComplianceScan({
    organizationId: org,
    contentText: c.draft,
    tenantId: tenant,
    contentType: c.contentType,
    targetChannel: c.targetChannel,
    userQuery: `red_team_compliance_${c.id}`,
    topic: c.topic,
    productTruthContextMdOverride: PRODUCT_MD,
    redTeamRawResponseOverride: MOCK ? c.canned.compliance : undefined,
    onRawModelResponse: MOCK
      ? undefined
      : (raw: string) => {
          try {
            assertRawAssistantLooksLikeJsonOnly(raw, `compliance raw ${c.id}`);
          } catch (e) {
            console.warn(`[warn] ${(e as Error).message}`);
          }
        },
  });
  validateComplianceSchema(comp);
  console.log('--- Compliance ---\n', JSON.stringify(comp, null, 2));

  const brand = await runBrandVoiceCheck({
    organizationId: org,
    contentText: c.draft,
    tenantId: tenant,
    userQuery: `red_team_brand_${c.id}`,
    brandVoiceContextMdOverride: BRAND_MD,
    redTeamRawResponseOverride: MOCK ? c.canned.brand : undefined,
    onRawModelResponse: MOCK
      ? undefined
      : (raw: string) => {
          try {
            assertRawAssistantLooksLikeJsonOnly(raw, `brand raw ${c.id}`);
          } catch (e) {
            console.warn(`[warn] ${(e as Error).message}`);
          }
        },
  });
  validateBrandVoiceSchema(brand);
  console.log('--- Brand Voice ---\n', JSON.stringify(brand, null, 2));

  const enforce = MOCK || STRICT_LIVE;
  if (c.id === 'A_Nightmare' && enforce) {
    behavioralCaseA(truth);
    behavioralCaseACompliance(comp);
  }
  if (c.id === 'C_Perfect' && enforce) {
    behavioralCaseC(truth, comp, brand);
  }

  if (!MOCK && !STRICT_LIVE && (c.id === 'A_Nightmare' || c.id === 'C_Perfect')) {
    console.log(
      '\n(note) Behavioral assertions skipped for live run. Use RED_TEAM_MOCK_LLM=1 or RED_TEAM_STRICT=1.',
    );
  }
}

async function main(): Promise<void> {
  console.log('Messign Marketing Gatekeepers — Red Team');
  console.log(`Tenant: ${RED_TEAM_TENANT_ID}`);
  if (!MOCK && !process.env.GROQ_API_KEY && !process.env.LITELLM_URL) {
    console.warn(
      '\n[warn] No GROQ_API_KEY or LITELLM_URL — live run may fail. Use RED_TEAM_MOCK_LLM=1 for offline mode.\n',
    );
  }

  for (const c of CASES) {
    await runCase(c);
  }

  logSection('Done — all cases parsed and schema-valid');
  if (MOCK) {
    console.log('Behavioral expectations enforced (mock mode).');
  } else if (STRICT_LIVE) {
    console.log('Behavioral expectations enforced (RED_TEAM_STRICT=1).');
  } else {
    console.log('Schema-only validation for live run (set RED_TEAM_STRICT=1 to enforce behaviors).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

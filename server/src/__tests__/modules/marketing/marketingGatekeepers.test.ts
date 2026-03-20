/**
 * Phase 2 QA — Red Team gatekeeper matrix (GK-01 … GK-05).
 *
 * - **Deterministic (default CI):** `redTeamRawResponseOverride` encodes the expected JSON shape
 *   (validators still run full `run*` + parsers; LLM is skipped).
 * - **Live Groq (optional):** `GROQ_API_KEY` + `MARKETING_GATEKEEPERS_LIVE=1` exercises real fast-tier calls
 *   against poisoned drafts + mock product-truth markdown.
 */
import { describe, it, expect } from 'vitest';
import {
  buildMockBrandVoiceProfileMd,
  buildMockProductTruthSheetMd,
  RED_TEAM_TENANT_ID,
} from '../../../scripts/redTeam/mockMarketingContext.js';
import { runProductTruthValidation } from '../../../services/ai/marketing/productTruthValidator.js';
import { runBrandVoiceCheck } from '../../../services/ai/marketing/brandVoiceChecker.js';
import { runComplianceScan } from '../../../services/ai/marketing/complianceScanner.js';

const ORG = '00000000-0000-0000-0000-00000000c0de';
const MOCK_TRUTH_MD = buildMockProductTruthSheetMd();
const MOCK_BRAND_MD = buildMockBrandVoiceProfileMd();

/** Product truth without the revenue-guarantee blocked line so Truth can PASS while Compliance flags puffery (GK-03 live). */
const GK03_TRUTH_MD_PASS_TRUTH = `
## Product truth (GK-03)

### Feature registry
- **Dora AI** (\`dora\`) — status: **shipped**
  AI assistant for work and knowledge.

### Approved claims / proof vault
- Messign helps teams collaborate in one place.

### Blocked / caution patterns
- \`we sell your data\` — prohibited

### Glossary
- **Workspace**: Messign Workspace product name.
`;

const LIVE = process.env.MARKETING_GATEKEEPERS_LIVE === '1' && Boolean(process.env.GROQ_API_KEY?.trim());

function truthJsonFixture(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    verdict: 'FAIL',
    checks: {
      feature_references: { status: 'FAIL', details: 'internal-only Finance' },
      blocked_claims: { status: 'PASS', details: null },
      fabricated_metrics: { status: 'PASS', details: null },
      superlatives: { status: 'PASS', details: null },
      glossary_compliance: { status: 'PASS', details: null },
    },
    failed_reasons: ['References Finance / Ops module which is internal_only in the registry.'],
    features_referenced: ['Finance / Ops module'],
    metrics_found: [],
    ...overrides,
  });
}

describe('marketingGatekeepers — GK deterministic (mocked LLM output)', () => {
  it('GK-01 (Truth Violation): FAIL + internal-only Finance', async () => {
    const draft = `Upgrade your stack with our Finance module for accounting and close.`;
    const r = await runProductTruthValidation({
      organizationId: ORG,
      contentText: draft,
      tenantId: RED_TEAM_TENANT_ID,
      productTruthContextMdOverride: MOCK_TRUTH_MD,
      userQuery: 'gk01_deterministic',
      redTeamRawResponseOverride: truthJsonFixture({
        verdict: 'FAIL',
        failed_reasons: ['Finance / Ops module is internal_only — must not be marketed as GA.'],
        features_referenced: ['Finance / Ops module'],
      }),
    });
    expect(r.verdict).toBe('FAIL');
    expect(r.failed_reasons.join(' ').toLowerCase()).toMatch(/finance|internal/);
  });

  it('GK-02 (Metric Hallucination): FAIL for unverified metrics', async () => {
    const draft = `Messign saves 99% of your time — guaranteed.`;
    const raw = JSON.stringify({
      verdict: 'FAIL',
      checks: {
        feature_references: { status: 'PASS', details: null },
        blocked_claims: { status: 'PASS', details: null },
        fabricated_metrics: { status: 'FAIL', details: '99% not in approved claims vault' },
        superlatives: { status: 'FAIL', details: null },
        glossary_compliance: { status: 'PASS', details: null },
      },
      failed_reasons: ['Fabricated metric: 99% time savings not supported by approved proof.'],
      features_referenced: [],
      metrics_found: ['99%'],
    });
    const r = await runProductTruthValidation({
      organizationId: ORG,
      contentText: draft,
      tenantId: RED_TEAM_TENANT_ID,
      productTruthContextMdOverride: MOCK_TRUTH_MD,
      userQuery: 'gk02_deterministic',
      redTeamRawResponseOverride: raw,
    });
    expect(r.verdict).toBe('FAIL');
    expect(r.failed_reasons.some((x) => /99%|metric/i.test(x))).toBe(true);
  });

  it('GK-03 (Compliance Risk): Truth PASS + Compliance WARNING HIGH', async () => {
    const draft = `Guaranteed to double your revenue when you adopt Messign.`;
    const truthPass = JSON.stringify({
      verdict: 'PASS',
      checks: {
        feature_references: { status: 'PASS', details: null },
        blocked_claims: { status: 'PASS', details: null },
        fabricated_metrics: { status: 'PASS', details: null },
        superlatives: { status: 'PASS', details: null },
        glossary_compliance: { status: 'PASS', details: null },
      },
      failed_reasons: [],
      features_referenced: [],
      metrics_found: [],
    });
    const compWarn = JSON.stringify({
      verdict: 'WARNING',
      warnings: [
        {
          check: 'performance_guarantee',
          severity: 'HIGH',
          location: 'body',
          issue: 'Guaranteed revenue doubling — performance guarantee',
          suggestion: 'Use directional language and link to case studies.',
        },
      ],
      warning_count: { high: 1, medium: 0, low: 0 },
      channel_specific_issues: [],
      email_compliance: null,
    });

    const [t, c] = await Promise.all([
      runProductTruthValidation({
        organizationId: ORG,
        contentText: draft,
        tenantId: RED_TEAM_TENANT_ID,
        productTruthContextMdOverride: GK03_TRUTH_MD_PASS_TRUTH,
        userQuery: 'gk03_truth',
        redTeamRawResponseOverride: truthPass,
      }),
      runComplianceScan({
        organizationId: ORG,
        contentText: draft,
        tenantId: RED_TEAM_TENANT_ID,
        contentType: 'blog',
        targetChannel: 'web',
        userQuery: 'gk03_comp',
        productTruthContextMdOverride: GK03_TRUTH_MD_PASS_TRUTH,
        redTeamRawResponseOverride: compWarn,
      }),
    ]);

    expect(t.verdict).toBe('PASS');
    expect(c.verdict).toBe('WARNING');
    expect(c.warnings.some((w) => w.severity === 'HIGH' && /revenue|guarantee/i.test(w.issue))).toBe(true);
  });

  it('GK-04 (Brand Taboo): score < 60 + synergy taboo', async () => {
    const draft = `Let's drive synergy across the revenue stack with Messign Workspace.`;
    const raw = JSON.stringify({
      score: 42,
      dimensions: { taboo_policy: 4, tone_voice: 10, clarity_structure: 10, audience_positioning: 10, claims_proof_safety: 8 },
      strengths: [],
      improvements: ['Remove jargon'],
      taboo_violations: ['synergy'],
      anti_example_matches: [],
      passes: false,
    });
    const r = await runBrandVoiceCheck({
      organizationId: ORG,
      contentText: draft,
      tenantId: RED_TEAM_TENANT_ID,
      brandVoiceContextMdOverride: MOCK_BRAND_MD,
      userQuery: 'gk04',
      redTeamRawResponseOverride: raw,
    });
    expect(r.score).toBeLessThan(60);
    expect(r.taboo_violations.map((x) => x.toLowerCase())).toContain('synergy');
  });

  it('GK-05 (Happy Path): Truth PASS, Compliance PASS, Brand strong', async () => {
    const draft = `Messign Workspace helps B2B teams replace tool sprawl with one place to plan, chat, and ship—grounded in how your org already works.`;
    const truthPass = JSON.stringify({
      verdict: 'PASS',
      checks: {
        feature_references: { status: 'PASS', details: null },
        blocked_claims: { status: 'PASS', details: null },
        fabricated_metrics: { status: 'PASS', details: null },
        superlatives: { status: 'PASS', details: null },
        glossary_compliance: { status: 'PASS', details: null },
      },
      failed_reasons: [],
      features_referenced: ['Messign Workspace'],
      metrics_found: [],
    });
    const brandPass = JSON.stringify({
      score: 88,
      dimensions: { tone_voice: 18, clarity_structure: 18, audience_positioning: 17, claims_proof_safety: 18, taboo_policy: 17 },
      strengths: ['Clear value prop'],
      improvements: [],
      taboo_violations: [],
      anti_example_matches: [],
      passes: true,
    });
    const compPass = JSON.stringify({
      verdict: 'PASS',
      warnings: [],
      warning_count: { high: 0, medium: 0, low: 0 },
      channel_specific_issues: [],
      email_compliance: null,
    });

    const [t, b, c] = await Promise.all([
      runProductTruthValidation({
        organizationId: ORG,
        contentText: draft,
        tenantId: RED_TEAM_TENANT_ID,
        productTruthContextMdOverride: MOCK_TRUTH_MD,
        userQuery: 'gk05_truth',
        redTeamRawResponseOverride: truthPass,
      }),
      runBrandVoiceCheck({
        organizationId: ORG,
        contentText: draft,
        tenantId: RED_TEAM_TENANT_ID,
        brandVoiceContextMdOverride: MOCK_BRAND_MD,
        userQuery: 'gk05_brand',
        redTeamRawResponseOverride: brandPass,
      }),
      runComplianceScan({
        organizationId: ORG,
        contentText: draft,
        tenantId: RED_TEAM_TENANT_ID,
        contentType: 'blog',
        targetChannel: 'LinkedIn',
        userQuery: 'gk05_comp',
        productTruthContextMdOverride: MOCK_TRUTH_MD,
        redTeamRawResponseOverride: compPass,
      }),
    ]);

    expect(t.verdict).toBe('PASS');
    expect(c.verdict).toBe('PASS');
    expect(c.warnings).toHaveLength(0);
    expect(b.score).toBeGreaterThan(85);
  });
});

describe.skipIf(!LIVE)('marketingGatekeepers — live Groq (MARKETING_GATEKEEPERS_LIVE=1)', () => {
  it('GK-01 live: Finance internal-only triggers FAIL', async () => {
    const draft = `Our Finance module is the best way to close your books this quarter.`;
    const r = await runProductTruthValidation({
      organizationId: ORG,
      contentText: draft,
      tenantId: RED_TEAM_TENANT_ID,
      productTruthContextMdOverride: MOCK_TRUTH_MD,
      userQuery: 'gk01_live',
    });
    expect(r.verdict).toBe('FAIL');
    expect(r.failed_reasons.join(' ').toLowerCase() + r.checks.feature_references.details?.toLowerCase()).toMatch(
      /finance|internal/,
    );
  }, 60_000);

  it('GK-02 live: 99% metric triggers FAIL', async () => {
    const draft = `Messign saves 99% of your time.`;
    const r = await runProductTruthValidation({
      organizationId: ORG,
      contentText: draft,
      tenantId: RED_TEAM_TENANT_ID,
      productTruthContextMdOverride: MOCK_TRUTH_MD,
      userQuery: 'gk02_live',
    });
    expect(r.verdict).toBe('FAIL');
  }, 60_000);

  it('GK-03 live: Truth PASS + Compliance WARNING on guarantee', async () => {
    const draft = `Guaranteed to double your revenue with Messign Workspace.`;
    const [t, c] = await Promise.all([
      runProductTruthValidation({
        organizationId: ORG,
        contentText: draft,
        tenantId: RED_TEAM_TENANT_ID,
        productTruthContextMdOverride: GK03_TRUTH_MD_PASS_TRUTH,
        userQuery: 'gk03_truth_live',
      }),
      runComplianceScan({
        organizationId: ORG,
        contentText: draft,
        tenantId: RED_TEAM_TENANT_ID,
        contentType: 'blog',
        targetChannel: 'web',
        productTruthContextMdOverride: GK03_TRUTH_MD_PASS_TRUTH,
        userQuery: 'gk03_comp_live',
      }),
    ]);
    expect(t.verdict).toBe('PASS');
    expect(c.verdict).toBe('WARNING');
    expect(c.warnings.some((w) => w.severity === 'HIGH')).toBe(true);
  }, 90_000);

  it('GK-04 live: synergy taboo lowers score', async () => {
    const draft = `Synergy synergy synergy — that's our Messign story.`;
    const r = await runBrandVoiceCheck({
      organizationId: ORG,
      contentText: draft,
      tenantId: RED_TEAM_TENANT_ID,
      brandVoiceContextMdOverride: MOCK_BRAND_MD,
      userQuery: 'gk04_live',
    });
    expect(r.score).toBeLessThan(60);
    expect(r.taboo_violations.some((x) => x.toLowerCase().includes('synergy'))).toBe(true);
  }, 60_000);

  it('GK-05 live: clean draft scores well', async () => {
    const draft = `Messign Workspace brings Dora AI into daily work so teams spend less time switching tools.`;
    const [t, b, c] = await Promise.all([
      runProductTruthValidation({
        organizationId: ORG,
        contentText: draft,
        tenantId: RED_TEAM_TENANT_ID,
        productTruthContextMdOverride: MOCK_TRUTH_MD,
        userQuery: 'gk05_truth_live',
      }),
      runBrandVoiceCheck({
        organizationId: ORG,
        contentText: draft,
        tenantId: RED_TEAM_TENANT_ID,
        brandVoiceContextMdOverride: MOCK_BRAND_MD,
        userQuery: 'gk05_brand_live',
      }),
      runComplianceScan({
        organizationId: ORG,
        contentText: draft,
        tenantId: RED_TEAM_TENANT_ID,
        contentType: 'blog',
        targetChannel: 'LinkedIn',
        productTruthContextMdOverride: MOCK_TRUTH_MD,
        userQuery: 'gk05_comp_live',
      }),
    ]);
    expect(t.verdict).toBe('PASS');
    expect(c.verdict).toBe('PASS');
    expect(b.score).toBeGreaterThan(85);
  }, 90_000);
});

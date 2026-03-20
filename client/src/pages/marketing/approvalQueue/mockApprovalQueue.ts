import type { ApprovalQueueItem } from './types';

const PASS_CHECKS = {
  feature_references: { status: 'PASS' as const, details: null },
  blocked_claims: { status: 'PASS' as const, details: null },
  fabricated_metrics: { status: 'PASS' as const, details: null },
  superlatives: { status: 'PASS' as const, details: null },
  glossary_compliance: { status: 'PASS' as const, details: null },
};

export const MOCK_APPROVAL_QUEUE: ApprovalQueueItem[] = [
  {
    id: 'aq-001',
    title: 'Q2 launch: Dora in every workflow',
    targetChannel: 'blog',
    campaignName: 'Spring Product Narrative',
    campaignId: 'cmp-spring',
    submittedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    userBrief:
      'Write a blog post for ops leaders explaining how Dora AI reduces context switching. Use approved claims only; no pricing.',
    body: `## Stop renting context across six tabs

Messign Workspace brings **Dora AI** into the flow of work—so your team replaces 4–6 scattered tools with one place to plan, chat, and ship.

Teams report Messign **saves an average of 4 hours per week** by cutting context switching, not by adding another dashboard.

When you're ready to see it on your stack, book a demo—we'll keep the conversation factual and proof-backed.`,
    brandVoiceScore: 91,
    productTruth: {
      verdict: 'PASS',
      checks: { ...PASS_CHECKS },
      failed_reasons: [],
      features_referenced: ['Dora AI', 'Messign Workspace'],
      metrics_found: ['4 hours per week', '4-6 tools'],
    },
    brandVoice: {
      score: 91,
      dimensions: {
        tone_voice: 18,
        clarity_structure: 19,
        audience_positioning: 18,
        claims_proof_safety: 18,
        taboo_policy: 18,
      },
      strengths: ['Clear structure', 'Approved metrics only', 'On-brand tone'],
      improvements: ['Optional: add one customer quote if approved'],
      taboo_violations: [],
      anti_example_matches: [],
      passes: true,
    },
    compliance: {
      verdict: 'PASS',
      warnings: [],
      warning_count: { high: 0, medium: 0, low: 0 },
      channel_specific_issues: [],
    },
    revisions: [
      {
        version: 1,
        label: 'v1 — first draft',
        savedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
        body: 'Shorter hook; fewer bullets. (mock)',
      },
      {
        version: 2,
        label: 'v2 — current',
        savedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
        body: `## Stop renting context across six tabs

Messign Workspace brings **Dora AI** into the flow of work—so your team replaces 4–6 scattered tools with one place to plan, chat, and ship.
...`,
      },
    ],
  },
  {
    id: 'aq-002',
    title: 'Webinar invite — ACT NOW (draft)',
    targetChannel: 'email',
    campaignName: 'Pipeline Acceleration',
    campaignId: 'cmp-pipeline',
    submittedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    userBrief: 'Email to nurture list: invite to Messign webinar. Keep CAN-SPAM honest; link pricing page.',
    body: `Subject: ACT NOW — FREE webinar this Thursday!!!

Hi {{first_name}},

We're running a **limited time** offer: **FREE** seats to see Dora live. No obligation.

Pricing starts at **$29/user/month** — lock it in before we raise rates.

Unsubscribe: not shown (mock draft issue).

— Marketing`,
    brandVoiceScore: 62,
    productTruth: {
      verdict: 'FAIL',
      checks: {
        feature_references: { status: 'PASS', details: null },
        blocked_claims: { status: 'FAIL', details: 'Specific pricing in body' },
        fabricated_metrics: { status: 'PASS', details: null },
        superlatives: { status: 'FAIL', details: 'Urgency language without proof' },
        glossary_compliance: { status: 'PASS', details: null },
      },
      failed_reasons: ['Blocked: pricing in copy', 'Superlatives / urgency'],
      features_referenced: ['Dora'],
      metrics_found: ['$29/user/month'],
    },
    brandVoice: {
      score: 62,
      dimensions: {
        tone_voice: 12,
        clarity_structure: 11,
        audience_positioning: 13,
        claims_proof_safety: 10,
        taboo_policy: 16,
      },
      strengths: ['Clear CTA intent'],
      improvements: ['Remove dollar pricing', 'Soften subject line', 'Add beta qualifiers if mentioning Gamification'],
      taboo_violations: [],
      anti_example_matches: ['Sounds like anti-example hype'],
      passes: false,
    },
    compliance: {
      verdict: 'WARNING',
      warnings: [
        {
          check: 'pricing_claims',
          severity: 'MEDIUM',
          location: 'body paragraph 3',
          issue: 'States $29/user/month in email body',
          suggestion: 'Replace with link to messign.com/pricing.',
        },
        {
          check: 'spam_triggers',
          severity: 'MEDIUM',
          location: 'subject and body',
          issue: 'ACT NOW, FREE, limited time, No obligation',
          suggestion: 'Reduce urgency phrasing; one exclamation max.',
        },
        {
          check: 'compliance_email',
          severity: 'HIGH',
          location: 'footer',
          issue: 'Marketing email missing unsubscribe mention in this draft',
          suggestion: 'Add one-click unsubscribe line for commercial email.',
        },
      ],
      warning_count: { high: 1, medium: 2, low: 0 },
      channel_specific_issues: ['Email: deliverability risk'],
      email_compliance: {
        has_unsubscribe_mention: false,
        has_sender_identification: true,
        spam_trigger_count: 4,
      },
    },
  },
  {
    id: 'aq-003',
    title: 'LinkedIn hook — tool sprawl (short)',
    targetChannel: 'linkedin',
    campaignName: 'Spring Product Narrative',
    campaignId: 'cmp-spring',
    submittedAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    userBrief: 'One LinkedIn post, under 2200 chars. Confident but no unverified superlatives.',
    body: `Tool sprawl isn't a budget problem—it's a context problem.

Messign Workspace + Dora AI = one stack. We're the **#1** platform for ambitious teams. Synergy!!!

Book a demo. 🚀🚀🚀`,
    brandVoiceScore: 48,
    productTruth: {
      verdict: 'FAIL',
      checks: {
        feature_references: { status: 'PASS', details: null },
        blocked_claims: { status: 'FAIL', details: '#1 claim without approved proof' },
        fabricated_metrics: { status: 'PASS', details: null },
        superlatives: { status: 'FAIL', details: '#1, synergy' },
        glossary_compliance: { status: 'PASS', details: null },
      },
      failed_reasons: ['Unverified superlative: #1', 'Blocked tone: synergy'],
      features_referenced: ['Dora AI', 'Messign Workspace'],
      metrics_found: [],
    },
    brandVoice: {
      score: 48,
      dimensions: {
        tone_voice: 8,
        clarity_structure: 10,
        audience_positioning: 9,
        claims_proof_safety: 6,
        taboo_policy: 15,
      },
      strengths: ['Short format'],
      improvements: ['Remove #1 and synergy', 'Reduce emoji stack', 'Align with golden examples'],
      taboo_violations: ['synergy'],
      anti_example_matches: ['Matches anti-example hype'],
      passes: false,
    },
    compliance: {
      verdict: 'WARNING',
      warnings: [
        {
          check: 'unsubstantiated_superlatives',
          severity: 'HIGH',
          location: 'sentence 3',
          issue: '#1 platform claim without proof',
          suggestion: 'Remove ranking or tie to approved claim with citation.',
        },
        {
          check: 'unsubstantiated_superlatives',
          severity: 'LOW',
          location: 'closing',
          issue: 'Triple emoji may read as engagement bait',
          suggestion: 'Cap at 0–2 emojis per brand policy.',
        },
      ],
      warning_count: { high: 1, medium: 0, low: 1 },
      channel_specific_issues: ['LinkedIn: keep hook professional'],
    },
  },
];

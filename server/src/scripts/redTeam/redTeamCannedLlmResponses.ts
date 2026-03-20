/**
 * Deterministic "LLM" outputs for `RED_TEAM_MOCK_LLM=1` — exercises parsers + expectations without Groq.
 */

export const cannedCaseA = {
  truth: JSON.stringify({
    verdict: 'FAIL',
    checks: {
      feature_references: {
        status: 'FAIL',
        details: 'References Finance / Ops module which is internal-only',
      },
      blocked_claims: { status: 'FAIL', details: 'Contains blocked performance guarantee language' },
      fabricated_metrics: { status: 'FAIL', details: 'Contains unverified metric: 99.9% of users agree' },
      superlatives: { status: 'FAIL', details: 'Unverified superlative: #1 best' },
      glossary_compliance: { status: 'PASS', details: null },
    },
    failed_reasons: [
      'References internal-only feature',
      'Blocked claim pattern',
      'Unverified metric',
      'Superlative without proof',
    ],
    features_referenced: ['Finance / Ops module', 'Dora AI', 'Gamification'],
    metrics_found: ['99.9%', '10x'],
  }),

  compliance: JSON.stringify({
    verdict: 'WARNING',
    warnings: [
      {
        check: 'competitor_disparagement',
        severity: 'HIGH',
        location: 'paragraph 2',
        issue: "Phrase 'Slack is an overpriced dinosaur' is disparaging",
        suggestion:
          'Use a neutral comparison: Slack focuses on chat; Messign combines chat with projects and AI in one workspace.',
      },
      {
        check: 'unsubstantiated_superlatives',
        severity: 'HIGH',
        location: 'paragraph 1',
        issue: 'Claims #1 best without proof',
        suggestion: 'Remove ranking claim or tie to approved proof from claims vault.',
      },
    ],
    warning_count: { high: 2, medium: 1, low: 0 },
    channel_specific_issues: [],
    email_compliance: null,
  }),

  brand: JSON.stringify({
    score: 24,
    dimensions: {
      tone_voice: 5,
      clarity_structure: 5,
      audience_positioning: 5,
      claims_proof_safety: 4,
      taboo_policy: 5,
    },
    strengths: [],
    improvements: ['Remove taboo term synergy', 'Drop unverified metrics and internal module reference'],
    taboo_violations: ['synergy'],
    anti_example_matches: ['Matches hypey anti-example tone'],
  }),
};

export const cannedCaseB = {
  truth: JSON.stringify({
    verdict: 'FAIL',
    checks: {
      feature_references: {
        status: 'FAIL',
        details: 'References Gamification without beta qualifier',
      },
      blocked_claims: { status: 'PASS', details: null },
      fabricated_metrics: { status: 'PASS', details: null },
      superlatives: { status: 'PASS', details: null },
      glossary_compliance: { status: 'PASS', details: null },
    },
    failed_reasons: ['References Gamification without beta qualifier'],
    features_referenced: ['Gamification'],
    metrics_found: [],
  }),

  compliance: JSON.stringify({
    verdict: 'WARNING',
    warnings: [
      {
        check: 'pricing_claims',
        severity: 'MEDIUM',
        location: 'body',
        issue: 'Specific price $29/user/month in email body',
        suggestion: 'Link to pricing page instead of stating price.',
      },
      {
        check: 'spam_triggers',
        severity: 'MEDIUM',
        location: 'subject/body',
        issue: 'ACT NOW, FREE, No obligation',
        suggestion: 'Soften CTAs; reduce urgency phrases for deliverability.',
      },
    ],
    warning_count: { high: 0, medium: 3, low: 0 },
    channel_specific_issues: ['Marketing email: spam-pattern language'],
    email_compliance: {
      has_unsubscribe_mention: false,
      has_sender_identification: true,
      spam_trigger_count: 3,
      spam_triggers_found: ['ACT NOW', 'FREE', 'No obligation'],
    },
  }),

  brand: JSON.stringify({
    score: 58,
    dimensions: {
      tone_voice: 12,
      clarity_structure: 11,
      audience_positioning: 12,
      claims_proof_safety: 11,
      taboo_policy: 12,
    },
    strengths: ['Clear CTA intent'],
    improvements: ['Remove pricing from copy', 'Add beta qualifier for Gamification'],
    taboo_violations: [],
    anti_example_matches: [],
  }),
};

export const cannedCaseC = {
  truth: JSON.stringify({
    verdict: 'PASS',
    checks: {
      feature_references: { status: 'PASS', details: null },
      blocked_claims: { status: 'PASS', details: null },
      fabricated_metrics: { status: 'PASS', details: null },
      superlatives: { status: 'PASS', details: null },
      glossary_compliance: { status: 'PASS', details: null },
    },
    failed_reasons: [],
    features_referenced: ['Dora AI'],
    metrics_found: ['4 hours per week', '4-6 tools'],
  }),

  compliance: JSON.stringify({
    verdict: 'PASS',
    warnings: [],
    warning_count: { high: 0, medium: 0, low: 0 },
    channel_specific_issues: [],
    email_compliance: null,
  }),

  brand: JSON.stringify({
    score: 92,
    dimensions: {
      tone_voice: 19,
      clarity_structure: 18,
      audience_positioning: 19,
      claims_proof_safety: 18,
      taboo_policy: 18,
    },
    strengths: ['Uses approved claims with sober tone', 'Clear structure'],
    improvements: ['Optional: tighten CTA'],
    taboo_violations: [],
    anti_example_matches: [],
  }),
};

export const cannedCaseD = {
  truth: JSON.stringify({
    verdict: 'PASS',
    checks: {
      feature_references: { status: 'PASS', details: null },
      blocked_claims: { status: 'PASS', details: null },
      fabricated_metrics: { status: 'PASS', details: null },
      superlatives: { status: 'PASS', details: null },
      glossary_compliance: { status: 'PASS', details: null },
    },
    failed_reasons: [],
    features_referenced: ['Dora AI', 'Messign Workspace'],
    metrics_found: [],
  }),

  compliance: JSON.stringify({
    verdict: 'WARNING',
    warnings: [
      {
        check: 'trademark_usage',
        severity: 'LOW',
        location: 'comparison table',
        issue: 'Competitor name without ™ on first reference (style)',
        suggestion: 'Add ™/® on first use if required by brand guidelines.',
      },
    ],
    warning_count: { high: 0, medium: 0, low: 1 },
    channel_specific_issues: [],
    email_compliance: null,
  }),

  brand: JSON.stringify({
    score: 72,
    dimensions: {
      tone_voice: 14,
      clarity_structure: 15,
      audience_positioning: 15,
      claims_proof_safety: 14,
      taboo_policy: 14,
    },
    strengths: ['Factual comparison framing'],
    improvements: ['Raise formality slightly for enterprise battlecard readers'],
    taboo_violations: [],
    anti_example_matches: [],
  }),
};

/**
 * Red team: synthetic marketing truth + brand voice context (no DB).
 * Shapes mirror org tables used by `loadProductTruthSheetMd` / `loadBrandVoiceProfileMd`.
 */

export interface MockFeatureRow {
  key: string;
  name: string;
  description: string;
  status: 'shipped' | 'beta' | 'internal_only' | 'coming_soon' | 'deprecated';
  announced: boolean;
}

export const FEATURE_REGISTRY: MockFeatureRow[] = [
  {
    key: 'dora',
    name: 'Dora AI',
    description: 'AI assistant for work and knowledge.',
    status: 'shipped',
    announced: true,
  },
  {
    key: 'gamification',
    name: 'Gamification',
    description: 'Merit Points and engagement mechanics.',
    status: 'beta',
    announced: true,
  },
  {
    key: 'finance_ops',
    name: 'Finance / Ops module',
    description: 'Internal billing and operations — not for external marketing.',
    status: 'internal_only',
    announced: false,
  },
  {
    key: 'whiteboard_v2',
    name: 'Collaborative Whiteboard 2.0',
    description: 'Upcoming visual collaboration.',
    status: 'coming_soon',
    announced: true,
  },
];

export const APPROVED_CLAIMS: { text: string; proof?: string }[] = [
  { text: 'saves an average of 4 hours per week', proof: 'internal survey Q3' },
  { text: 'replaces 4-6 tools', proof: 'customer interviews' },
];

export const BLOCKED_CLAIMS: { pattern: string; reason: string }[] = [
  { pattern: 'we sell your data', reason: 'False and prohibited' },
  { pattern: 'guaranteed to double your revenue', reason: 'Performance guarantee — blocked' },
];

export const GLOSSARY: { term: string; definition: string }[] = [
  {
    term: 'Merit Points',
    definition: 'Non-monetary recognition units in Gamification; not currency.',
  },
  {
    term: 'Workspace',
    definition: 'Messign Workspace — the product name; not a generic “workspace” metaphor unless clear.',
  },
];

export const BRAND_PROFILE = {
  tone: 'expert but accessible',
  personality: ['direct', 'confident', 'helpful'],
  taboos: ['growth hack', 'ninja', 'synergy'],
  productNames: ['Messign Workspace', 'Dora'],
};

export const GOLDEN_EXAMPLES = [
  {
    title: 'Dora launch — social',
    body: 'Dora AI turns scattered context into one place your team can act on—without adding another silo.',
  },
  {
    title: 'Tool sprawl — blog hook',
    body: 'Most teams run 4–6 tools just to plan and chat. Messign Workspace replaces that sprawl with one coherent system.',
  },
];

export const ANTI_EXAMPLES = [
  {
    title: 'Hypey generic',
    body: 'Our synergy ninja growth-hack playbook will 10x your hustle overnight!!!',
  },
];

/** Markdown block injected as PRODUCT_TRUTH_CONTEXT / BLOCKED_CLAIMS_AND_PRODUCT_TRUTH */
export function buildMockProductTruthSheetMd(): string {
  const featLines = FEATURE_REGISTRY.map(
    (f) =>
      `- **${f.name}** (\`${f.key}\`) — status: **${f.status}**${f.announced && f.status === 'coming_soon' ? ' (announced)' : ''}\n  ${f.description}\n`,
  ).join('');

  const claims = APPROVED_CLAIMS.map((c) => `- ${c.text}${c.proof ? ` _(proof: ${c.proof})_` : ''}\n`).join('');

  const blocked = BLOCKED_CLAIMS.map((b) => `- \`${b.pattern}\` — ${b.reason}\n`).join('');

  const gloss = GLOSSARY.map((g) => `- **${g.term}**: ${g.definition}\n`).join('');

  return `## Product truth sheet (red team mock)

### Feature registry
${featLines}

### Approved claims / proof vault
${claims}

### Blocked / caution patterns
${blocked}

### Glossary
${gloss}

### Competitor map (use approved points only)
- **Slack** — approved: focuses on messaging; compare on scope, do not insult.
`;
}

/** Markdown injected as BRAND_PROFILE for brand voice checker */
export function buildMockBrandVoiceProfileMd(): string {
  const golden = GOLDEN_EXAMPLES.map((e, i) => `- _golden_ **${e.title}**\n  ${e.body}\n`).join('');
  const anti = ANTI_EXAMPLES.map((e) => `- _anti_ **${e.title}**\n  ${e.body}\n`).join('');

  return `## Brand voice profile (red team mock)

### Profile JSON
\`\`\`json
${JSON.stringify(BRAND_PROFILE, null, 2)}
\`\`\`

### Examples
${golden}
${anti}
`;
}

export const RED_TEAM_TENANT_ID = '00000000-0000-0000-0000-00000000a1e5';

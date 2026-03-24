import type { ClassifiedRequest, DoraContext, Domain } from '../types.js';

const DOMAIN_KEYWORDS: Array<{ domain: Domain; weight: number; patterns: RegExp[] }> = [
  {
    domain: 'finance',
    weight: 1,
    patterns: [/\b(invoice|budget|expense|reimburs|payroll|ledger|vat|tax|revenue|profit|financial|spending|cost|earnings|income|cash\s*flow)\b/i],
  },
  {
    domain: 'hr',
    weight: 1,
    patterns: [/\b(hire|candidate|interview|pto|leave|performance review|headcount)\b/i],
  },
  {
    domain: 'crm',
    weight: 1,
    patterns: [/\b(deal|pipeline|crm|opportunity|forecast|sales)\b/i],
  },
  {
    domain: 'support',
    weight: 1,
    patterns: [/\b(ticket|sla|support|customer health|escalat)\b/i],
  },
  {
    domain: 'marketing',
    weight: 1,
    patterns: [/\b(campaign|roi|marketing|lead|content topic)\b/i],
  },
  {
    domain: 'time',
    weight: 1,
    patterns: [/\b(timesheet|utilization|time off|allocation)\b/i],
  },
  {
    domain: 'okr',
    weight: 1,
    patterns: [/\b(okr|objective|key result|goal tree)\b/i],
  },
  {
    domain: 'assets',
    weight: 1,
    patterns: [/\b(asset|license|equipment)\b/i],
  },
  {
    domain: 'contracts',
    weight: 1,
    patterns: [/\b(contract|renewal|clause)\b/i],
  },
  {
    domain: 'culture',
    weight: 0.8,
    patterns: [/\b(culture|values|team health|morale)\b/i],
  },
  {
    domain: 'knowledge',
    weight: 1,
    patterns: [/\b(policy|guide|document|handbook|how do i|where is)\b/i],
  },
  {
    domain: 'analytics',
    weight: 1,
    patterns: [/\b(dashboard|metrics|report|activity|approval queue|stats|overview|performance|summary|kpi)\b/i],
  },
  {
    domain: 'settings',
    weight: 0.7,
    patterns: [/\b(settings|preferences|profile|permissions)\b/i],
  },
  {
    domain: 'executive',
    weight: 1,
    patterns: [/\b(executive|company overview|briefing|board)\b/i],
  },
];

const PATH_HINTS: Array<{ prefix: string; domain: Domain }> = [
  { prefix: '/reimbursements', domain: 'finance' },
  { prefix: '/crm', domain: 'crm' },
  { prefix: '/support', domain: 'support' },
  { prefix: '/marketing', domain: 'marketing' },
  { prefix: '/recruitment', domain: 'hr' },
  { prefix: '/time', domain: 'time' },
  { prefix: '/knowledge-hub', domain: 'knowledge' },
  { prefix: '/assets', domain: 'assets' },
  { prefix: '/contracts', domain: 'contracts' },
  { prefix: '/culture', domain: 'culture' },
];

function pagePathBoost(path: string): Domain | null {
  const p = path.toLowerCase();
  for (const { prefix, domain } of PATH_HINTS) {
    if (p.startsWith(prefix)) return domain;
  }
  return null;
}

/** Chip / slash intents from intent-router presets (prefix match) */
const DIRECT_INTENT_PATTERN =
  /^(knowledge\.|finance\.|quick\.|dashboard\.|admin\.|reports\.|crm\.|support\.|marketing\.|hr\.|time\.|okr\.)/i;

export function classifyIntent(message: string, ctx: DoraContext): ClassifiedRequest {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  const flags = {
    isKbOnly: /\b(only|just)\s+(the\s+)?(docs?|documents?|kb|knowledge base)\b/i.test(trimmed),
    isGreeting: /^(hi|hello|hey|good morning|good afternoon|thanks|thank you)[\s!.?]*$/i.test(trimmed),
    isWebSearch: /\b(search the web|google|internet|online source)\b/i.test(trimmed),
    requiresAct: /\b(create|update|delete|send|assign|approve|reject|post|schedule)\b/i.test(trimmed),
    isPresentation: /\b(slide|deck|presentation|ppt)\b/i.test(trimmed),
  };

  if (DIRECT_INTENT_PATTERN.test(trimmed)) {
    const id = trimmed.split(/\s+/)[0]?.replace(/^\//, '') ?? trimmed;
    return {
      domain: 'conversation',
      confidence: 0.95,
      directIntent: id,
      flags,
    };
  }

  const scores = new Map<Domain, number>();
  for (const { domain, weight, patterns } of DOMAIN_KEYWORDS) {
    let s = 0;
    for (const re of patterns) {
      if (re.test(trimmed)) s += weight;
    }
    if (s > 0) scores.set(domain, (scores.get(domain) ?? 0) + s);
  }

  const pathDomain = pagePathBoost(ctx.pagePath);
  if (pathDomain) {
    scores.set(pathDomain, (scores.get(pathDomain) ?? 0) + 0.35);
  }

  let best: Domain = 'unknown';
  let bestScore = 0;
  for (const [d, s] of scores) {
    if (s > bestScore) {
      best = d;
      bestScore = s;
    }
  }

  const confidence = Math.min(1, bestScore / 2.5);

  if (bestScore === 0 && flags.isGreeting) {
    return { domain: 'conversation', confidence: 0.9, flags: { ...flags, isKbOnly: false } };
  }

  return {
    domain: best,
    confidence: bestScore === 0 ? 0.2 : confidence,
    flags,
  };
}

/**
 * Messign AI Brain — Query Classification Engine
 *
 * Classifies user queries into intent tiers for 3-tier intelligence routing:
 * - knowledge: docs, guides, policies, definitions
 * - product: tasks, performance, projects, teams, finances, approvals, etc.
 * - system: system overview, executive report, platform stats, KB stats
 * - general: greetings, thanks, "what can you do", ambiguous
 */

export type QueryIntent = 'knowledge' | 'product' | 'system' | 'general';

export interface ClassificationResult {
  intent: QueryIntent;
  confidence: number;
}

function isSystemIntent(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\b(system[- ]?wide|system)\s+(overview|summary)\b/i.test(q) ||
    /\b(give\s+me\s+a\s+)?system[- ]?wide\s+overview\b/i.test(q) ||
    /\bexecutive\s+(report|summary)\b/i.test(q) ||
    /\b(generate\s+)?(an?\s+)?executive\s+summary\b/i.test(q) ||
    /\bcompany\s+dashboard\b/i.test(q) ||
    /\boverall\s+(metrics|stats|summary)\b/i.test(q) ||
    /\bplatform\s+stats\b/i.test(q) ||
    /^(system\s+)?overview\b/i.test(q) ||
    /\bhow\s+many\s+documents?\s+(are\s+)?(in\s+)?(the\s+)?knowledge\s+base\b/i.test(q) ||
    /\bhow\s+many\s+(are\s+)?stale\b/i.test(q) ||
    /\bknowledge\s+base\s+(stats?|statistics|count|size)\b/i.test(q) ||
    /\b(document|doc)\s+count\b/i.test(q) ||
    /\bhow\s+big\s+is\s+(our\s+)?(knowledge\s+base|kb)\b/i.test(q) ||
    /\bhow\s+many\s+docs?\s+(need\s+)?review\b/i.test(q)
  );
}

function isProductIntent(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    // Tasks
    /\b(my|me)\b.*\b(tasks|work|assignments)\b/i.test(q) ||
    /\b(what\s+are\s+my|show\s+my)\s+(open\s+)?tasks/i.test(q) ||
    /\b(open\s+tasks|what\s+am\s+i\s+working\s+on)\b/i.test(q) ||
    /^(my\s+)?(open\s+)?tasks\b/i.test(q) ||
    // Performance
    (/\b(my|me)\b.*\b(performance|stats|productivity|output)\b/i.test(q) ||
      /\b(show\s+me|how\s+am\s+i)\b.*\b(performance|stats)\b/i.test(q)) &&
      !/\b(team|teams)\b/i.test(q) ||
    /\bperformance\s+(this\s+)?(month|week|year)\b/i.test(q) ||
    /^(my|show\s+my)\s+performance/i.test(q) ||
    // Teams
    /\b(team|teams)['\s]+(overview|metrics|status|performance|comparison)\b/i.test(q) ||
    /\b(all\s+)?teams?['\s]*\s*(performance|comparison)\b/i.test(q) ||
    /\bcompare\s+(all\s+)?(team|teams)\b/i.test(q) ||
    // Financial
    /\b(financial|finance|budget|spending|reimbursement|invoice|expense)\s+(summary|overview|report)\b/i.test(q) ||
    /\b(company[- ]?wide|company)\s+financial\s+summary\b/i.test(q) ||
    /\bwhat('s| is)\s+(our|the)\s+(total\s+)?(spending|budget|finance)\b/i.test(q) ||
    /\bhow\s+much\s+(have\s+we\s+)?spent\b/i.test(q) ||
    // Approvals
    /\b(items?|things?|what)\s+(need|needs|require|requires)\s+approval\b/i.test(q) ||
    /\bapproval\s+(queue|list|items?)\b/i.test(q) ||
    /\bpending\s+approvals?\b/i.test(q) ||
    /\bdo\s+i\s+have\s+anything\s+to\s+approve\b/i.test(q) ||
    // Projects
    /\b(project|projects)\s+(status|progress|overview)\b/i.test(q) ||
    /\b(how\s+are\s+)?(all\s+)?(active\s+)?projects\b/i.test(q) ||
    // Activity
    /\b(recent|latest)\s+activity\b/i.test(q) ||
    /\bwhat\s+(happened|'s\s+been\s+going\s+on)\s+(today|recently)?\b/i.test(q) ||
    /\bactivity\s+(feed|log)\b/i.test(q) ||
    // Sprint
    /\bsprint\s+(status|progress|burndown)\b/i.test(q) ||
    /\b(current|this)\s+sprint\b/i.test(q) ||
    // Leaderboard
    /\b(leaderboard|achievements?|badges?)\b/i.test(q) ||
    /\b(top\s+)?performers?\b/i.test(q) ||
    // Invoices
    /\b(outstanding|unpaid|overdue)\s+invoices?\b/i.test(q) ||
    /\binvoices?\s+(outstanding|unpaid|due)\b/i.test(q) ||
    // Reimbursements
    /\b(my\s+)?(reimbursements?|expense\s+claims?)\b/i.test(q) ||
    /\bpending\s+reimbursements?\b/i.test(q) ||
    // Support
    /\b(ticket|tickets|support|help\s*desk|sla|csat)\b/i.test(q)
  );
}

function isKnowledgeIntent(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\b(document|documents|guide|guides|policy|policies|sop|faq|handbook)\b/i.test(q) ||
    /\bhow\s+do\s+I\b/i.test(q) ||
    /\bwhat\s+is\s+our\s+policy\s+on\b/i.test(q) ||
    /\bwhat\s+does\s+(the\s+)?(documentation|docs?)\s+say\b/i.test(q) ||
    /\b(define|definition|what\s+is|what\s+does)\s+.+\s+mean\b/i.test(q) ||
    /\b(define|explain)\s+[\w\s]+\b/i.test(q) &&
      q.length < 80 ||
    /\b(documentation|internal\s+docs?|company\s+docs?)\b/i.test(q) ||
    /\b(procedure|process|workflow)\s+(for|to)\b/i.test(q) ||
    /\b(meeting\s+notes?|announcement|specification)\b/i.test(q)
  );
}

function isGeneralIntent(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /^(hi|hello|hey|thanks|thank\s+you|ok|okay|bye|goodbye)\s*$/i.test(q) ||
    /\bwhat\s+can\s+I\s+ask\b/i.test(q) ||
    /\bwhat\s+can\s+you\s+do\b/i.test(q) ||
    /\bwhat\s+are\s+you\s+capable\s+of\b/i.test(q) ||
    /^help\s*$/i.test(q) ||
    q.length < 15 && !/\b(my|me|our|team|project|task)\b/i.test(q)
  );
}

/**
 * Classify a user query into intent tier and confidence.
 * Order of checks: system > product > knowledge > general (general is fallback).
 */
export function classifyQuery(query: string): ClassificationResult {
  const trimmed = query.trim();
  if (!trimmed) {
    return { intent: 'general', confidence: 0 };
  }

  if (isSystemIntent(trimmed)) {
    return { intent: 'system', confidence: 0.9 };
  }

  if (isProductIntent(trimmed)) {
    return { intent: 'product', confidence: 0.9 };
  }

  if (isKnowledgeIntent(trimmed)) {
    return { intent: 'knowledge', confidence: 0.85 };
  }

  if (isGeneralIntent(trimmed)) {
    return { intent: 'general', confidence: 0.8 };
  }

  // Ambiguous: default to knowledge (RAG) for definition-style or long queries
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount <= 5 && /\?$/.test(trimmed)) {
    return { intent: 'knowledge', confidence: 0.5 };
  }
  if (wordCount > 8) {
    return { intent: 'knowledge', confidence: 0.5 };
  }

  return { intent: 'general', confidence: 0.4 };
}

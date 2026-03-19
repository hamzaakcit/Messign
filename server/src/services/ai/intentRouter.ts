/**
 * @deprecated This router is a legacy fallback. All new queries should go through
 * the orchestrator agent system (agents/orchestrator.ts → specialists/).
 * This file will be removed once the orchestrator handles all edge cases.
 * Track remaining usages before deletion.
 *
 * Messign AI Brain — Intent Router
 *
 * Orchestrator: routes user queries to tools, executes them,
 * formats results for the synthesis LLM.
 */

import type OpenAI from 'openai';
import { getToolsForLLM, executeTool, getAllTools } from './toolRegistry.js';
import { callModelSafe } from './gateway.js';
import { sanitizeData, truncateText } from './dataSanitizer.js';
import { logToolExecution } from './queryLogger.js';
import { classifyQuery, type ClassificationResult, type QueryIntent } from './queryClassifier.js';
import { buildDoraRouterPrompt } from './dora/prompts.js';
import type { DoraRequestContext } from './dora/types.js';
import type { ToolContext, ToolResult, RouterResult, ChatMessage, ParsedToolCall, LLMToolDefinition } from './types.js';
import { getPresetCallsForIntentId } from './intentIdPresets.js';

function toOpenAITools(tools: LLMToolDefinition[]): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters as unknown as OpenAI.FunctionParameters,
    },
  }));
}

function parseGatewayToolCalls(choices: { message?: { tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> } }[]): ParsedToolCall[] | null {
  const toolCalls = choices?.[0]?.message?.tool_calls;
  if (!toolCalls?.length) return null;
  return toolCalls.map((tc) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function?.arguments || '{}') as Record<string, unknown>;
    } catch {
      // ignore
    }
    return {
      name: tc.function?.name || 'unknown',
      args,
      callId: tc.id,
    };
  });
}

/** Route via gateway only (no direct API fallback). */
async function routeViaGateway(
  systemPrompt: string,
  userQuery: string,
  history: ChatMessage[],
  tools: LLMToolDefinition[],
  tenantId: string,
): Promise<{ content: string | null; toolCalls: ParsedToolCall[] | null }> {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];
  const recentHistory = history.slice(-6);
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  messages.push({ role: 'user', content: userQuery });

  const tiers: Array<'fast' | 'balanced' | 'complex'> = ['fast', 'balanced', 'complex'];
  for (const tier of tiers) {
    try {
      const response = await callModelSafe({
        tier,
        messages,
        tools: tools.length > 0 ? toOpenAITools(tools) : undefined,
        tenantId,
        maxTokens: 512,
        temperature: 0.1,
        userQuery,
      });
      const choice = response.choices?.[0]?.message;
      const toolCalls = parseGatewayToolCalls(response.choices ?? []);
      return {
        content: choice?.content ?? null,
        toolCalls: toolCalls ?? null,
      };
    } catch {
      continue;
    }
  }
  throw new Error('Intent router: all gateway tiers failed');
}

function getIntentRoutingHint(intent: QueryIntent): string {
  switch (intent) {
    case 'knowledge':
      return '\nINTENT: Knowledge/documentation query. PRIORITIZE search_knowledge_base for docs, guides, policies, definitions.';
    case 'product':
      return '\nINTENT: Product/live data query. PRIORITIZE product tools (get_tasks_by_user, get_employee_performance, get_system_stats, get_financial_summary, get_approval_queue, get_project_status, get_team_overview, get_recent_activity, etc.). Do NOT use search_knowledge_base for live data.';
    case 'system':
      return '\nINTENT: System overview/stats. Use get_system_stats or get_knowledge_base_stats. Do NOT use search_knowledge_base.';
    case 'general':
      return '\nINTENT: General/conversational. Use get_available_questions for "what can you do", or respond directly for greetings.';
    default:
      return '';
  }
}

function isExecutiveDashboardQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\bexecutive\s+dashboard\b/i.test(q) ||
    /\bcompany\s+at\s+a\s+glance\b/i.test(q) ||
    /\bunified\s+dashboard\b/i.test(q)
  );
}

function isDailyBriefingQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\bdaily\s+briefing\b/i.test(q) ||
    /\bmorning\s+briefing\b/i.test(q) ||
    /\bmy\s+briefing\b/i.test(q)
  );
}

function getToolsForIntent(intent: QueryIntent): ReturnType<typeof getToolsForLLM> {
  if (intent === 'product') {
    const allTools = getAllTools();
    const productTools = allTools.filter((t) => t.category !== 'knowledge');
    return productTools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
  return getToolsForLLM();
}

function buildRouterSystemPrompt(context: ToolContext, classification?: ClassificationResult): string {
  const today = new Date().toISOString().split('T')[0];

  const intentHint = classification
    ? getIntentRoutingHint(classification.intent)
    : '';

  return `You are a QUERY ROUTER for Messign Workspace, a company management platform.

YOUR ONLY JOB: Analyze the user's question and decide which tools to call to get the data needed to answer it. You do NOT answer the question yourself — you just pick the right tools.
${intentHint}

CRITICAL TOOL ROUTING (use the correct tool for each question type):
- "What are my tasks?" / "My open tasks" / "What am I working on?" → use get_tasks_by_user with user_identifier="me", status_filter="active"
- "How is my performance?" / "My performance this month" / "Show me my stats" → use get_employee_performance with employee_identifier="me", time_period="this_month"
- "System-wide overview" / "System overview" / "Executive report" / "Executive summary" / "Company dashboard" / "Platform stats" → use get_system_stats (NOT search_knowledge_base)
- "Company-wide financial summary" / "Financial overview" / "Budget summary" / "Total spending" / "Reimbursements" → use get_financial_summary (NOT search_knowledge_base)
- "What items need approval?" / "Approval queue" / "Pending approvals" / "What needs my approval?" → use get_approval_queue (NOT search_knowledge_base)
- "Project status" / "How are projects" / "Active projects" → use get_project_status
- "Team overview" / "All teams' performance comparison" / "Compare teams" / "Team metrics" → use get_team_overview with team_identifier="all"
- "Recent activity" / "What happened today" / "Activity feed" → use get_recent_activity
- "How many documents in the knowledge base?" / "How many are stale?" / "Knowledge base stats" → use get_knowledge_base_stats (NOT search_knowledge_base)
- "What can I ask?" / "What questions are available?" / "What can you do?" → use get_available_questions
- "Executive dashboard" / "Company at a glance" → use get_executive_dashboard
- "Daily briefing" / "Morning briefing" → use generate_daily_briefing
- Documents, guides, policies, "how do I...?", "what is our policy on...?" → use search_knowledge_base
- Project status, budgets, deadlines → use get_project_status or search_knowledge_base
- NEVER use search_knowledge_base for personal data (tasks, performance), system overview, financial summaries, approval queue, project status, team overview, activity, or document count/staleness — use the specific tools instead

RULES:
- You MUST call at least one tool for any question about company data, people, projects, tasks, performance, finances, or documents.
- You CAN call MULTIPLE tools if the question spans different data domains (e.g., "How is John doing on Project X?" needs both employee and project tools).
- For questions about documents, guides, policies, or "how to" questions, always include search_knowledge_base.
- For greetings, thanks, casual conversation, or questions about yourself, respond directly WITHOUT calling any tools. Just say something brief and helpful.
- If the question is ambiguous, prefer calling more tools rather than fewer — extra data is better than missing data.
- Today's date is ${today}.
- The asking user's ID is ${context.userId}, role is "${context.userRole}".
- When a user says "my" or "me", they mean user_id=${context.userId}${context.userName ? ` (${context.userName})` : ''}.
- When a user says "my team", they mean team_id=${context.teamId || 'unknown'}.

NEVER explain your reasoning. ONLY call tools or respond directly for conversational messages.`;
}

/** Returns true if the query is asking for system-wide overview / executive report / summary. */
function isOverviewStyleQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\b(system[- ]?wide|system)\s+(overview|summary)\b/i.test(q) ||
    /\b(give\s+me\s+a\s+)?system[- ]?wide\s+overview\b/i.test(q) ||
    /\bexecutive\s+(report|summary)\b/i.test(q) ||
    /\b(generate\s+)?(an?\s+)?executive\s+summary\b/i.test(q) ||
    /\bcompany\s+dashboard\b/i.test(q) ||
    /\boverall\s+(metrics|stats|summary)\b/i.test(q) ||
    /\bplatform\s+stats\b/i.test(q) ||
    /^(system\s+)?overview\b/i.test(q)
  );
}

/** Returns true if the query is asking for financial/budget/spending data. */
function isFinancialQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\b(financial|finance|budget|spending|reimbursement|invoice|expense)\s+(summary|overview|report|status)\b/i.test(q) ||
    /\b(company[- ]?wide|company)\s+financial\s+(summary|status)\b/i.test(q) ||
    /\bwhat('s| is)\s+(our|the)\s+(total\s+)?(spending|budget|finance|revenue)\b/i.test(q) ||
    /\b(our|the)\s+revenue\s+(this\s+)?(quarter|month|year)\b/i.test(q) ||
    /\brevenue\s+(this\s+)?(quarter|month|year)\b/i.test(q) ||
    /\bhow\s+much\s+(have\s+we\s+)?spent\b/i.test(q) ||
    /\b(total\s+)?reimbursements?\s+(this\s+)?(month|quarter|year)\b/i.test(q) ||
    /\binvoice\s+summary\b/i.test(q) ||
    /\bfinance\s+page\b/i.test(q) ||
    /\bcheck\s+(the\s+)?(company\s+)?financial\s+status\b/i.test(q)
  );
}

/** Returns true if the query is asking about items needing approval / approval queue. */
function isApprovalQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\b(items?|things?|what)\s+(need|needs|require|requires)\s+approval\b/i.test(q) ||
    /\bapproval\s+(queue|list|items?)\b/i.test(q) ||
    /\b(what|show)\s+(needs?|pending)\s+(my\s+)?approval\b/i.test(q) ||
    /\bpending\s+approvals?\b/i.test(q) ||
    /\b(across\s+the\s+)?system\b.*\bapproval\b/i.test(q) ||
    /\bapproval\b.*\b(across|system|all)\b/i.test(q) ||
    /\bwhat('s| is)\s+(in\s+my\s+)?(review\s+)?queue\b/i.test(q) ||
    /\b(anything|something)\s+(waiting|pending)\s+(for\s+me)?\b/i.test(q) ||
    /\bdo\s+i\s+have\s+anything\s+to\s+approve\b/i.test(q)
  );
}

/** Returns true if the query is asking about project status, progress, or project list. */
function isProjectStatusQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\b(project|projects)\s+(status|progress|overview)\b/i.test(q) ||
    /\b(how\s+are\s+)?(all\s+)?(active\s+)?projects\b/i.test(q) ||
    /\b(show\s+me\s+)?(all\s+)?(active\s+)?projects\b/i.test(q) ||
    /\bwhich\s+projects\s+(are\s+)?(behind|delayed)\b/i.test(q) ||
    /\bproject\s+(status|statuses)\b/i.test(q)
  );
}

/** Returns true if the query is asking about team overview, team metrics, or team comparison. */
function isTeamOverviewQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\b(team|teams)['\s]+(overview|metrics|status|performance|comparison)\b/i.test(q) ||
    /\b(all\s+)?teams?['\s]*\s*(performance|comparison)\b/i.test(q) ||
    /\b(team|teams)\s+(overview|metrics|status|performance)\b/i.test(q) ||
    /\bhow\s+(is|are)\s+(my\s+)?(team|teams)\b/i.test(q) ||
    /\b(show\s+me\s+)?(all\s+)?(team|teams)\b.*\b(performance|comparison|metrics)\b/i.test(q) ||
    /\b(team|department)\s+(overview|report)\b/i.test(q) ||
    /\bwhich\s+team\s+is\s+(performing\s+)?best\b/i.test(q) ||
    /\bcompare\s+(all\s+)?(team|teams)\b/i.test(q) ||
    /\b(team|teams)\s+comparison\b/i.test(q)
  );
}

/** Returns true if the query is asking about recent activity or activity feed. */
function isActivityQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\b(recent|latest)\s+activity\b/i.test(q) ||
    /\bwhat\s+(happened|'s\s+been\s+going\s+on)\s+(today|recently)?\b/i.test(q) ||
    /\bactivity\s+(feed|log)\b/i.test(q) ||
    /\b(latest|recent)\s+updates?\b/i.test(q) ||
    /\bwhat('s| has)\s+been\s+going\s+on\b/i.test(q)
  );
}

/** Returns true if the query is asking about sprint status or progress. */
function isSprintQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\bsprint\s+(status|progress|burndown)\b/i.test(q) ||
    /\b(current|this)\s+sprint\b/i.test(q) ||
    /\bhow\s+(is\s+)?the\s+sprint\s+going\b/i.test(q) ||
    /\bstory\s+points?\s+(left|remaining)\b/i.test(q)
  );
}

/** Returns true if the query is asking about leaderboard, achievements, or badges. */
function isLeaderboardQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\b(leaderboard|achievements?|badges?)\b/i.test(q) ||
    /\bwho('s| is)\s+(on\s+top|top\s+of)\b/i.test(q) ||
    /\b(top\s+)?performers?\b/i.test(q) ||
    /\b(my\s+)?(xp|points|mp)\b/i.test(q) ||
    /\bmp\s+leaderboard\b/i.test(q) ||
    /\bleaderboard\s+.*\bmp\b/i.test(q)
  );
}

/** Returns true if the query is asking about outstanding/unpaid invoices. */
function isInvoiceQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\b(outstanding|unpaid|overdue)\s+invoices?\b/i.test(q) ||
    /\binvoices?\s+(outstanding|unpaid|due)\b/i.test(q) ||
    /\bshow\s+me\s+invoices?\b/i.test(q) ||
    /\binvoice\s+(details?|list)\b/i.test(q)
  );
}

/** Returns true if the query is asking what questions the user can ask. */
function isAvailableQuestionsQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\bwhat\s+can\s+I\s+ask\b/i.test(q) ||
    /\bwhat\s+questions?\s+(can\s+I\s+)?(ask|are\s+available)\b/i.test(q) ||
    /\bwhat\s+can\s+you\s+do\b/i.test(q) ||
    /\bwhat\s+are\s+you\s+capable\s+of\b/i.test(q) ||
    /\blist\s+(available\s+)?questions?\b/i.test(q) ||
    /^help\s*$/i.test(q) ||
    /\bwhat\s+do\s+you\s+support\b/i.test(q)
  );
}

/** Returns true if the query is asking about knowledge base document count or staleness. */
function isKnowledgeBaseStatsQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\bhow\s+many\s+documents?\s+(are\s+)?(in\s+)?(the\s+)?knowledge\s+base\b/i.test(q) ||
    /\bhow\s+many\s+(are\s+)?stale\b/i.test(q) ||
    /\bknowledge\s+base\s+(stats?|statistics|count|size)\b/i.test(q) ||
    /\b(document|doc)\s+count\b/i.test(q) ||
    /\bhow\s+big\s+is\s+(our\s+)?(knowledge\s+base|kb)\b/i.test(q) ||
    /\bhow\s+many\s+docs?\s+(need\s+)?review\b/i.test(q)
  );
}

/** Returns true if the query is asking about reimbursements (my or pending). */
function isReimbursementQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  return (
    /\b(my\s+)?(reimbursements?|expense\s+claims?)\b/i.test(q) ||
    /\bpending\s+reimbursements?\b/i.test(q) ||
    /\b(reimbursement|expense)\s+(status|history)\b/i.test(q) ||
    /\bhow\s+much\s+am\s+i\s+owed\b/i.test(q)
  );
}

/**
 * Keyword-based pre-routing for common queries.
 * Bypasses LLM when we detect clear patterns — ensures correct tool selection
 * even when Groq/Gemini fail or return wrong tools.
 */
function getForcedToolCalls(query: string): ParsedToolCall[] | null {
  const q = query.toLowerCase().trim();

  // "All teams' performance" / "Team comparison" / "Compare teams" → get_team_overview (MUST be before "my performance")
  if (isExecutiveDashboardQuery(query)) {
    return [{ name: 'executive:get_executive_dashboard', args: {} }];
  }

  if (isDailyBriefingQuery(query)) {
    return [{ name: 'executive:generate_daily_briefing', args: {} }];
  }

  if (isTeamOverviewQuery(query)) {
    const teamId = /\bmy\b.*\bteam|\bteam\b.*\bmy\b/i.test(q) && !/\ball\s+teams?\b/i.test(q) ? 'my' : 'all';
    return [{ name: 'people:get_team_overview', args: { team_identifier: teamId } }];
  }

  // "My performance" / "Show me my stats" / "How am I doing" → get_employee_performance (NOT team comparison)
  if (
    /\b(my|me)\b.*\b(performance|stats|productivity|output)\b/i.test(q) ||
    /\b(show\s+me|how\s+am\s+i)\b.*\b(performance|stats)\b/i.test(q) && !/\b(team|teams)\b/i.test(q) ||
    /\bperformance\s+(this\s+)?(month|week|year)\b/i.test(q) ||
    /^(my|show\s+my)\s+performance/i.test(q)
  ) {
    const period = q.includes('week') ? 'this_week' : q.includes('year') ? 'this_year' : 'this_month';
    return [{ name: 'people:get_employee_performance', args: { employee_identifier: 'me', time_period: period } }];
  }

  // "My tasks" / "Open tasks" / "What am I working on" → get_tasks_by_user
  if (
    /\b(my|me)\b.*\b(tasks|work|assignments)\b/i.test(q) ||
    /\b(what\s+are\s+my|show\s+my)\s+(open\s+)?tasks/i.test(q) ||
    /\b(open\s+tasks|what\s+am\s+i\s+working\s+on)\b/i.test(q) ||
    /^(my\s+)?(open\s+)?tasks\b/i.test(q)
  ) {
    return [{ name: 'projects:get_tasks_by_user', args: { user_identifier: 'me', status_filter: 'active' } }];
  }

  // "System-wide overview" / "System overview" / "Executive report" / "Company dashboard" → get_system_stats
  if (isOverviewStyleQuery(query)) {
    const detailLevel = /\b(detailed|executive|full)\b/i.test(q) ? 'detailed' : 'summary';
    return [{ name: 'analytics:get_system_stats', args: { detail_level: detailLevel } }];
  }

  // "Company-wide financial summary" / "Financial overview" / "Budget summary" → get_financial_summary
  if (isFinancialQuery(query)) {
    const period = q.includes('quarter') ? 'this_quarter' : q.includes('year') ? 'this_year' : 'this_month';
    const scope = /\b(company[- ]?wide|company|our|we)\b/i.test(q) ? 'company' : 'my';
    return [{ name: 'finance:get_financial_summary', args: { time_period: period, scope } }];
  }

  // "What items need approval?" / "Approval queue" / "Pending approvals" → get_approval_queue
  if (isApprovalQuery(query)) {
    const domain = q.includes('reimbursement') ? 'reimbursements' : q.includes('document') ? 'documents' : q.includes('invoice') ? 'invoices' : 'all';
    return [{ name: 'analytics:get_approval_queue', args: { domain } }];
  }

  // "Project status" / "How are projects" / "Active projects" → get_project_status
  if (isProjectStatusQuery(query)) {
    const projectName = /\bmy\b.*\bproject/i.test(q) ? 'my' : 'all';
    return [{ name: 'projects:get_project_status', args: { project_name: projectName } }];
  }

  // "Recent activity" / "What happened today" / "Activity feed" → get_recent_activity
  if (isActivityQuery(query)) {
    const scope = /\bmy\b|\b(user|person)\b/i.test(q) ? 'user' : 'system';
    const args: Record<string, unknown> = { scope };
    if (scope === 'user') args.user_identifier = 'me';
    return [{ name: 'analytics:get_recent_activity', args }];
  }

  // "Sprint status" / "Sprint progress" → get_sprint_status
  if (isSprintQuery(query)) {
    return [{ name: 'projects:get_sprint_status', args: { project_name: 'all' } }];
  }

  // "Leaderboard" / "Achievements" / "Badges" / "MP leaderboard" → get_achievements_leaderboard
  if (isLeaderboardQuery(query)) {
    const queryType = q.includes('my') ? 'user_badges' : 'leaderboard';
    const args: Record<string, unknown> = { query_type: queryType };
    if (queryType === 'user_badges') args.user_identifier = 'me';
    return [{ name: 'achievements:get_achievements_leaderboard', args }];
  }

  // "Outstanding invoices" / "Unpaid invoices" → get_invoice_details
  if (isInvoiceQuery(query)) {
    const statusFilter = q.includes('overdue') ? 'overdue' : 'pending';
    return [{ name: 'finance:get_invoice_details', args: { search_term: 'all', status_filter: statusFilter } }];
  }

  // "My reimbursements" / "Pending reimbursements" → get_reimbursement_details
  if (isReimbursementQuery(query)) {
    return [{ name: 'finance:get_reimbursement_details', args: { user_identifier: 'me' } }];
  }

  // "How many documents in the knowledge base?" / "How many are stale?" → get_knowledge_base_stats
  if (isKnowledgeBaseStatsQuery(query)) {
    return [{ name: 'knowledge:get_knowledge_base_stats', args: {} }];
  }

  // "What can I ask?" / "What questions are available?" → get_available_questions
  if (isAvailableQuestionsQuery(query)) {
    return [{ name: 'system:get_available_questions', args: {} }];
  }

  return null;
}

async function executeForcedToolCalls(
  forcedCalls: ParsedToolCall[],
  context: ToolContext,
  logLabel: string,
): Promise<RouterResult> {
  console.log(`[Intent Router] ${logLabel}:`, forcedCalls.map((t) => t.name).join(', '));
  const executions = forcedCalls.map(async (call) => {
    const start = Date.now();
    const result = await executeTool(call.name, call.args as Record<string, unknown>, context);
    const elapsed = Date.now() - start;
    logToolExecution(null, call.name, elapsed, result.success, result.metadata?.count ?? 0).catch((err) =>
      console.error('[intentRouter] logToolExecution failed', { error: err instanceof Error ? err.message : String(err) }),
    );
    return { name: call.name, result, elapsed };
  });
  const results = await Promise.all(executions);
  const toolResults = results.map((r) => ({
    ...r.result,
    data: r.result.data ? sanitizeData(r.result.data, context.userRole === 'admin') : null,
  }));
  return {
    toolResults,
    toolsUsed: results.map((r) => r.name),
    combinedContext: formatCombinedContext(toolResults, results.map((r) => r.name)),
    isConversational: false,
  };
}

/**
 * Route a user's query to the appropriate tools.
 */
export async function routeQuery(
  query: string,
  history: ChatMessage[],
  context: ToolContext,
  doraCtx?: DoraRequestContext,
  options?: { intentId?: string },
): Promise<RouterResult> {
  if (options?.intentId) {
    const preset = getPresetCallsForIntentId(options.intentId);
    if (preset?.length) {
      return executeForcedToolCalls(preset, context, `Intent-id preset (${options.intentId})`);
    }
  }

  // Pre-route: force correct tool for common personal-data queries
  const forcedCalls = getForcedToolCalls(query);
  if (forcedCalls) {
    return executeForcedToolCalls(forcedCalls, context, 'Pre-routed to');
  }

  const classification = classifyQuery(query);
  console.log('[Intent Router] Classified intent:', classification.intent, 'confidence:', classification.confidence);

  const tools = getToolsForIntent(classification.intent);
  const systemPrompt = doraCtx
    ? buildDoraRouterPrompt(doraCtx)
    : buildRouterSystemPrompt(context, classification);

  let toolCalls: ParsedToolCall[] | null = null;
  let directContent: string | null = null;

  const tenantId = context.organizationId ?? 'system';

  try {
    const result = await routeViaGateway(systemPrompt, query, history, tools, tenantId);
    toolCalls = result.toolCalls;
    directContent = result.content;
  } catch (gatewayError: unknown) {
    const msg = gatewayError instanceof Error ? gatewayError.message : String(gatewayError);
    console.warn('[Intent Router] Gateway routing failed, using keyword fallbacks:', msg);
    if (isOverviewStyleQuery(query)) {
      console.log('[Intent Router] All routers failed. Overview query → falling back to get_system_stats.');
      toolCalls = [{ name: 'analytics:get_system_stats', args: { detail_level: 'summary' } }];
    } else if (isFinancialQuery(query)) {
      console.log('[Intent Router] All routers failed. Financial query → falling back to get_financial_summary.');
      toolCalls = [{ name: 'finance:get_financial_summary', args: { time_period: 'this_month', scope: 'company' } }];
    } else if (isApprovalQuery(query)) {
      console.log('[Intent Router] All routers failed. Approval query → falling back to get_approval_queue.');
      toolCalls = [{ name: 'analytics:get_approval_queue', args: { domain: 'all' } }];
    } else if (isProjectStatusQuery(query)) {
      console.log('[Intent Router] All routers failed. Project query → falling back to get_project_status.');
      toolCalls = [{ name: 'projects:get_project_status', args: { project_name: 'all' } }];
    } else if (isTeamOverviewQuery(query)) {
      console.log('[Intent Router] All routers failed. Team query → falling back to get_team_overview.');
      toolCalls = [{ name: 'people:get_team_overview', args: { team_identifier: 'all' } }];
    } else if (isActivityQuery(query)) {
      console.log('[Intent Router] All routers failed. Activity query → falling back to get_recent_activity.');
      toolCalls = [{ name: 'analytics:get_recent_activity', args: { scope: 'system' } }];
    } else if (isSprintQuery(query)) {
      console.log('[Intent Router] All routers failed. Sprint query → falling back to get_sprint_status.');
      toolCalls = [{ name: 'projects:get_sprint_status', args: { project_name: 'all' } }];
    } else if (isLeaderboardQuery(query)) {
      console.log('[Intent Router] All routers failed. Leaderboard query → falling back to get_achievements_leaderboard.');
      toolCalls = [{ name: 'achievements:get_achievements_leaderboard', args: { query_type: 'leaderboard' } }];
    } else if (isInvoiceQuery(query)) {
      console.log('[Intent Router] All routers failed. Invoice query → falling back to get_invoice_details.');
      toolCalls = [{ name: 'finance:get_invoice_details', args: { search_term: 'all', status_filter: 'pending' } }];
    } else if (isReimbursementQuery(query)) {
      console.log('[Intent Router] All routers failed. Reimbursement query → falling back to get_reimbursement_details.');
      toolCalls = [{ name: 'finance:get_reimbursement_details', args: { user_identifier: 'me' } }];
    } else if (isKnowledgeBaseStatsQuery(query)) {
      console.log('[Intent Router] All routers failed. Knowledge base stats query → falling back to get_knowledge_base_stats.');
      toolCalls = [{ name: 'knowledge:get_knowledge_base_stats', args: {} }];
    } else if (isAvailableQuestionsQuery(query)) {
      console.log('[Intent Router] All routers failed. Available questions query → falling back to get_available_questions.');
      toolCalls = [{ name: 'system:get_available_questions', args: {} }];
    } else {
      console.log('[Intent Router] All routers failed. Falling back to knowledge base search.');
      toolCalls = [{ name: 'knowledge:search_knowledge_base', args: { query } }];
    }
  }

  if (!toolCalls || toolCalls.length === 0) {
    const kbStart = Date.now();
    const kbResult = await executeTool('knowledge:search_knowledge_base', { query }, context);
    const kbElapsed = Date.now() - kbStart;
    logToolExecution(null, 'knowledge:search_knowledge_base', kbElapsed, kbResult.success, kbResult.metadata?.count ?? 0).catch((err) => console.error('[intentRouter] logToolExecution failed', { error: err instanceof Error ? err.message : String(err) }));
    const hasKBResults = kbResult.success && Array.isArray(kbResult.data) && (kbResult.data as unknown[]).length > 0;

    return {
      toolResults: hasKBResults ? [kbResult] : [],
      toolsUsed: hasKBResults ? ['knowledge:search_knowledge_base'] : [],
      combinedContext: hasKBResults
        ? `[Background context from knowledge base]\n${kbResult.summary}`
        : '',
      isConversational: true,
    };
  }

  console.log(`[Intent Router] Executing ${toolCalls.length} tool(s): ${toolCalls.map((t) => t.name).join(', ')}`);

  const executions = toolCalls.map(async (call) => {
    const start = Date.now();
    const result = await executeTool(call.name, call.args as Record<string, unknown>, context);
    const elapsed = Date.now() - start;
    return { name: call.name, result, elapsed };
  });

  const settled = await Promise.allSettled(executions);

  const toolResults: ToolResult[] = [];
  const toolsUsed: string[] = [];

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      const { name: toolName, result, elapsed } = outcome.value;
      toolsUsed.push(toolName);
      // Fire-and-forget tool execution logging (query_log_id linked later in handler)
      logToolExecution(null, toolName, elapsed, result.success, result.metadata?.count ?? 0).catch((err) => console.error('[intentRouter] logToolExecution failed', { error: err instanceof Error ? err.message : String(err) }));
      const sanitizedResult: ToolResult = {
        ...result,
        data: result.data
          ? sanitizeData(result.data, context.userRole === 'admin')
          : null,
      };
      toolResults.push(sanitizedResult);
    } else {
      console.error('[Intent Router] Tool execution promise rejected:', outcome.reason);
    }
  }

  const combinedContext = formatCombinedContext(toolResults, toolsUsed);

  return {
    toolResults,
    toolsUsed,
    combinedContext,
    isConversational: false,
  };
}

function formatCombinedContext(results: ToolResult[], toolNames: string[]): string {
  if (results.length === 0) {
    return 'No data was found for this query. The tools returned no results.';
  }

  const sections: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const toolName = toolNames[i] || 'unknown';

    if (!result.success) {
      sections.push(`[${toolName}] — ${result.summary || 'Failed to retrieve data.'}`);
      continue;
    }

    const header = `=== Data from: ${toolName} ===`;
    const meta = result.metadata
      ? `(Source tables: ${result.metadata.source}${result.metadata.count ? `, ${result.metadata.count} records` : ''}${result.metadata.timeRange ? `, period: ${result.metadata.timeRange}` : ''})`
      : '';

    const bodyLimit = toolName?.includes('search_knowledge_base') ? 3000 : 4000;
    const body = truncateText(result.summary || JSON.stringify(result.data, null, 2), bodyLimit);

    sections.push(`${header}\n${meta}\n${body}`);
  }

  return sections.join('\n\n---\n\n');
}

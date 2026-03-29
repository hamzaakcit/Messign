/**
 * Tool: get_available_questions
 *
 * Returns the list of questions users can ask the AI, based on their role.
 * Use for "What can I ask?", "What questions are available?", "What can you do?"
 *
 * Role tiers: `admin` and `cpo` receive manager prompts plus `ADMIN_EXTENDED_QUESTIONS` (org-wide,
 * department-report phrasings, Reports Hub umbrella line). `manager`, `hr`, and `finance` receive
 * the manager tier only. Everyone else gets the employee base list. Deduplication uses `Set` order.
 *
 * See `docs/dora-available-questions.md` for how this relates to `analytics:get_department_report`
 * and the Reports Hub (`AVAILABLE_REPORT_TYPES` in `dal/reports/reportGenerator.ts`).
 */

import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const EMPLOYEE_QUESTIONS = [
  'What are my open tasks?',
  'Show me my performance this month',
  'What bounties are available?',
  'What badges have I earned?',
  'Show me my pending reimbursements',
  'Search the knowledge base for [topic]',
];

const MANAGER_QUESTIONS = [
  ...EMPLOYEE_QUESTIONS,
  "Show me my team's performance this month",
  'What is the status of all active projects?',
  'What needs my approval?',
  'Who are the top performers this quarter?',
  'What is the current sprint status?',
  'How do all teams compare this month?',
];

/** Admin / CPO: everything managers can ask, plus org-wide prompts (deduped at runtime). */
const ADMIN_ONLY_QUESTIONS = [
  'Give me a system-wide overview',
  'Generate an executive summary for this quarter',
  'What is the company-wide financial summary this month?',
  "Show me all teams' performance comparison",
  'What items need approval across the system?',
  'How many documents are in the knowledge base? How many are stale?',
  'Create a presentation about [topic]',
];

/**
 * Phrasings aligned with `analytics:get_department_report` (see departmentReport.ts).
 * Admin/CPO only — tool is restricted to those roles.
 */
const DEPARTMENT_REPORT_EXAMPLE_QUESTIONS = [
  'Give me an executive summary',
  'Give me a department report or company report',
  'How are all teams doing?',
  'Give me a monthly or quarterly company review',
  'Prepare data for the board meeting',
];

/**
 * Single umbrella prompt for the Reports Hub. Concrete report types live in
 * `AVAILABLE_REPORT_TYPES` in `dal/reports/reportGenerator.ts` and are not duplicated here.
 */
const REPORT_HUB_CATALOG_LINE = 'What kinds of reports can I generate in the Reports Hub?';

const ADMIN_EXTENDED_QUESTIONS = [
  ...ADMIN_ONLY_QUESTIONS,
  ...DEPARTMENT_REPORT_EXAMPLE_QUESTIONS,
  REPORT_HUB_CATALOG_LINE,
];

/**
 * Returns deduplicated example questions for the given role (same logic as `system:get_available_questions`).
 */
export function getAvailableQuestionsForRole(role: string): string[] {
  const r = (role || 'employee').toLowerCase();
  let questions: string[];
  if (['admin', 'cpo'].includes(r)) {
    questions = [...MANAGER_QUESTIONS, ...ADMIN_EXTENDED_QUESTIONS];
  } else if (['manager', 'hr', 'finance'].includes(r)) {
    questions = [...MANAGER_QUESTIONS];
  } else {
    questions = [...EMPLOYEE_QUESTIONS];
  }
  return [...new Set(questions)];
}

const availableQuestionsTool: Tool = {
  name: 'system:get_available_questions',
  metadata: {
    namespace: 'system',
    name: 'get_available_questions',
    summary: 'List example questions Dora can answer. For "what can you do" queries.',
    tags: ['system', 'help', 'examples'],
    alwaysLoaded: false,
    parameterHints: '(none)',
  },
  category: 'system',

  description: `Return the list of questions the user can ask the AI Assistant, based on their role.

For admin/CPO, the list includes manager prompts, org-wide asks, executive/department report phrasings (see analytics:get_department_report), and a Reports Hub catalog line (see AVAILABLE_REPORT_TYPES in reportGenerator).

Use this tool when someone asks:
- "What can I ask?"
- "What questions are available?"
- "What can you do?"
- "What are you capable of?"
- "Help" or "What do you support?"
- "List available questions"`,

  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },

  async execute(_args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const role = (context.userRole || 'employee').toLowerCase();
    const uniqueQuestions = getAvailableQuestionsForRole(role);
    const summary = `Questions you can ask the AI Assistant

Based on your role (${role}), here are the types of questions I can answer:

${uniqueQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

You can also ask about specific documents, policies, or search the knowledge base for any topic. Try asking in natural language — I'll find the right data for you.`;

    return {
      success: true,
      data: { questions: uniqueQuestions, role },
      summary,
      metadata: { source: 'system', count: uniqueQuestions.length },
    };
  },
};

registerTool(availableQuestionsTool);
export default availableQuestionsTool;

/**
 * Tool: get_available_questions
 *
 * Returns the list of questions users can ask the AI, based on their role.
 * Use for "What can I ask?", "What questions are available?", "What can you do?"
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

const ADMIN_QUESTIONS = [
  ...EMPLOYEE_QUESTIONS,
  'Give me a system-wide overview',
  'Generate an executive summary for this quarter',
  'What is the company-wide financial summary this month?',
  "Show me all teams' performance comparison",
  'What items need approval across the system?',
  'How many documents are in the knowledge base? How many are stale?',
  'What is the status of all active projects?',
  'What is the current sprint status?',
  'Create a presentation about [topic]',
];

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
    let questions: string[];

    if (['admin', 'cpo'].includes(role)) {
      questions = ADMIN_QUESTIONS;
    } else if (['manager', 'hr'].includes(role)) {
      questions = MANAGER_QUESTIONS;
    } else {
      questions = EMPLOYEE_QUESTIONS;
    }

    const uniqueQuestions = [...new Set(questions)];
    const summary = `**Questions you can ask the AI Assistant**

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

export const MODULE_CORRELATIONS = [
  {
    from: 'get_team_overview',
    to: 'get_tasks_by_user',
    linkDescription: "Use an employee's ID from the team overview as user_identifier to find their tasks.",
    example: 'get_team_overview → find "Emily Davis" → get_tasks_by_user(user_identifier: "Emily Davis")',
  },
  {
    from: 'get_team_overview',
    to: 'get_employee_performance',
    linkDescription: "Use an employee's name or ID to get their detailed performance metrics.",
    example: 'get_team_overview → find top MP holder → get_employee_performance(employee_identifier: name)',
  },
  {
    from: 'get_team_overview',
    to: 'get_user_profile',
    linkDescription: "Use an employee's name to get their full profile with recent activity.",
    example: 'get_team_overview → find someone → get_user_profile(employee_identifier: name)',
  },
  {
    from: 'get_financial_summary',
    to: 'get_team_overview',
    linkDescription: 'Financial summary shows revenue. Use team overview to get top performers by department.',
    example: 'get_financial_summary → see revenue → get_team_overview(department: their_dept)',
  },
  {
    from: 'get_system_stats',
    to: 'get_financial_summary',
    linkDescription: 'System stats give overview. Financial summary shows invoice breakdown and revenue.',
    example: 'get_system_stats → see overview → get_financial_summary → compare billed vs collected',
  },
  {
    from: 'get_tasks_by_user',
    to: 'get_project_status',
    linkDescription: 'Tasks belong to projects. Use the project name from a task to get project-level status.',
    example: 'get_tasks_by_user → see "Brand Refresh 2026" task → get_project_status(project_name: "Brand Refresh 2026")',
  },
  {
    from: 'get_project_status',
    to: 'get_tasks_by_user',
    linkDescription: 'Projects contain tasks assigned to team members. Query individual assignments.',
    example: 'get_project_status → see assignees → get_tasks_by_user(user_identifier: assignee) for each',
  },
  {
    from: 'get_project_status',
    to: 'get_invoice_details',
    linkDescription: "Project work may correspond to invoiced periods. Check invoices for the project's active months.",
    example: 'get_project_status → see active dates → get_invoice_details(period: those_months)',
  },
  {
    from: 'get_employee_performance',
    to: 'get_achievements_leaderboard',
    linkDescription: 'Performance MP ties to the achievements leaderboard ranking.',
    example: 'get_employee_performance → see MP score → get_achievements_leaderboard → find their rank',
  },
  {
    from: 'search_chat_messages',
    to: 'search_knowledge_base',
    linkDescription: 'Chat discussions may reference KB documents. Search KB for terms mentioned in chat.',
    example: 'search_chat_messages("API design") → mentions "Tech Spec" → search_knowledge_base("API technical specification")',
  },
  {
    from: 'get_invoice_details',
    to: 'get_financial_summary',
    linkDescription: 'Individual invoices roll up into the financial summary. Use both for detailed vs aggregate view.',
    example: 'get_invoice_details → see individual invoices → get_financial_summary → see totals and trends',
  },
] as const;

export function buildCorrelationPromptSection(): string {
  const lines = MODULE_CORRELATIONS.map((c) =>
    `- **${c.from}** → **${c.to}**: ${c.linkDescription}\n  _Example: ${c.example}_`
  );

  return `## Cross-Module Data Paths

When answering complex questions, you often need data from multiple sources.
Here are the valid paths for connecting data across modules:

${lines.join('\n\n')}

### How to Use These Paths

1. Start with the tool most relevant to the CORE of the question.
2. Look at the data you receive — identify names, IDs, project names, or time periods.
3. Use those identifiers as parameters in the NEXT tool call.
4. Continue until you have enough data to answer completely.

**Example multi-step chain:**
User: "Which team members contributed most to revenue and what are they working on?"
- Step 1: \`get_financial_summary\` or \`get_team_overview\` → find top revenue contributors
- Step 2: \`get_team_overview\` → get their departments and roles
- Step 3: \`get_tasks_by_user\` for each top contributor → find their current tasks
- Synthesize: Combine all data into a coherent answer.`;
}

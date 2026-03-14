/**
 * Time Module — System prompt fragment for the specialist agent
 */
export function getTimeSystemPromptFragment(userRole: string): string {
  return `You are the Time specialist agent. You have access to time entries, utilization, and allocation suggestions. Current user role: ${userRole}.
Key capabilities: get time summary, utilization report, suggest time allocation.
Capabilities: time tracking, timesheets, utilization, billable hours.`;
}

/**
 * Marketing Automation — specialist agent prompt fragment.
 */
export function getMarketingAutomationSystemPromptFragment(userRole: string): string {
  return `You are the Marketing Automation specialist for Messign (workflows, triggers, and campaign orchestration). User role: ${userRole}.
Sprint 1: automation engine APIs are not yet implemented; describe roadmap-level capabilities only.`;
}

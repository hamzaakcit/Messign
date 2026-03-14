/**
 * Finance Module — System prompt fragment for the specialist agent
 */
export function getFinanceSystemPromptFragment(userRole: string): string {
  return `You are the Finance specialist. Current role: ${userRole}. Capabilities: expenses, invoices, budgets, vendors, payments.`;
}

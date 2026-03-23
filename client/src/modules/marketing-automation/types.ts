/**
 * Marketing Automation — client DTOs (keep aligned with server/src/modules/marketing_automation/types/workflows.ts).
 */

export type AutomationTriggerType = 'schedule' | 'event' | 'manual';

export type AutomationStatus = 'draft' | 'active' | 'paused' | 'archived';

export interface MarketingAutomationDefinition {
  id: string;
  organizationId: string;
  name: string;
  status: AutomationStatus;
  trigger: AutomationTriggerType;
  triggerConfig: Record<string, unknown>;
  steps: unknown[];
  createdAt: string;
  updatedAt: string;
}

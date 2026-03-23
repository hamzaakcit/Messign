/**
 * Marketing Automation — workflow / trigger DTOs (implementation in later sprints).
 */

export type AutomationTriggerType = 'schedule' | 'event' | 'manual';

export type AutomationStatus = 'draft' | 'active' | 'paused' | 'archived';

/** Placeholder for persisted automation definitions */
export interface MarketingAutomationDefinition {
  id: string;
  organizationId: string;
  name: string;
  status: AutomationStatus;
  trigger: AutomationTriggerType;
  /** Cron or event name — shape TBD when engine lands */
  triggerConfig: Record<string, unknown>;
  /** Steps: email, webhook, CRM update, etc. */
  steps: unknown[];
  createdAt: string;
  updatedAt: string;
}

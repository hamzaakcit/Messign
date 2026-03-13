/**
 * CRM Module — Platform plugin entry point
 * Implements PlatformModule for CRM & Sales.
 */
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { crmTools } from './tools/index.js';
import { crmRouter } from './routes/index.js';
import { registerCrmEventHandlers } from './events/subscribers.js';
import { getCrmSystemPromptFragment } from './prompts/crmContext.js';

export const crmModule: PlatformModule = {
  namespace: 'crm',
  displayName: 'CRM & Sales',
  requiredRoles: ['sales', 'manager', 'admin'],

  registerTools(): ToolRegistration[] {
    return crmTools;
  },

  getRouter() {
    return crmRouter;
  },

  registerEventHandlers(eventBus: EventBus): void {
    registerCrmEventHandlers(eventBus);
  },

  getSystemPromptFragment(userRole: string): string {
    return getCrmSystemPromptFragment(userRole);
  },
};

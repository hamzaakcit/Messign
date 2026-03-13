/**
 * Finance Module — Platform plugin (stub)
 * Wraps existing finance routes. Tools and prompts to be migrated.
 */
import { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { financeRouter } from '../../routes/finance/index.js';

export const financeModule: PlatformModule = {
  namespace: 'finance',
  displayName: 'Finance',
  requiredRoles: ['finance', 'finance_admin', 'manager', 'admin'],

  registerTools(): ToolRegistration[] {
    return [];
  },

  getRouter(): Router {
    return financeRouter;
  },

  registerEventHandlers(_eventBus: EventBus): void {
    // Event handlers migrated from finance subscribers when ready
  },

  getSystemPromptFragment(userRole: string): string {
    return `You are the Finance specialist. Current role: ${userRole}. Capabilities: expenses, invoices, budgets, vendors, payments.`;
  },
};

/**
 * OKR Module — Platform plugin (stub)
 * Wraps existing OKR routes. Tools and prompts to be migrated.
 */
import { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { okrRouter } from '../../routes/okr/index.js';

export const okrModule: PlatformModule = {
  namespace: 'okr',
  displayName: 'OKRs',
  requiredRoles: ['manager', 'admin'],

  registerTools(): ToolRegistration[] {
    return [];
  },

  getRouter(): Router {
    return okrRouter;
  },

  registerEventHandlers(_eventBus: EventBus): void {
    // Event handlers for okr.* events when ready
  },

  getSystemPromptFragment(userRole: string): string {
    return `You are the OKR specialist. Current role: ${userRole}. Capabilities: goals, key results, check-ins.`;
  },
};

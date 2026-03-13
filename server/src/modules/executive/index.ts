/**
 * Executive Module — Platform plugin (stub)
 * Wraps existing executive routes. Tools and prompts to be migrated.
 */
import { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import executiveRouter from '../../routes/executive/index.js';
import { crossModuleQuery } from './tools/crossModuleQuery.js';

export const executiveModule: PlatformModule = {
  namespace: 'executive',
  displayName: 'Executive Dashboard',
  requiredRoles: ['admin', 'manager', 'executive'],

  registerTools(): ToolRegistration[] {
    return [crossModuleQuery];
  },

  getRouter(): Router {
    return executiveRouter;
  },

  registerEventHandlers(_eventBus: EventBus): void {
    // Event handlers for executive.* events when ready
  },

  getSystemPromptFragment(userRole: string): string {
    return `You are the Executive specialist. Current role: ${userRole}. Capabilities: KPIs, dashboard, reports, briefings.`;
  },
};

/**
 * HR Module — Platform plugin (stub)
 * Recruitment routes live under /api/recruitment. HR-specific routes to be added.
 */
import { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { recruitmentRouter } from '../../routes/recruitment/index.js';

export const hrModule: PlatformModule = {
  namespace: 'recruitment',
  displayName: 'HR & Recruitment',
  requiredRoles: ['hr', 'manager', 'admin'],

  registerTools(): ToolRegistration[] {
    return [];
  },

  getRouter(): Router {
    return recruitmentRouter;
  },

  registerEventHandlers(_eventBus: EventBus): void {
    // Event handlers for hr.* events when ready
  },

  getSystemPromptFragment(userRole: string): string {
    return `You are the HR specialist. Current role: ${userRole}. Capabilities: recruitment pipeline, candidates, jobs.`;
  },
};

/**
 * HR Module — Platform plugin
 * Implements PlatformModule for HR & Recruitment (namespace 'hr').
 * Includes recruitment DAL, employees, routes, tools, events.
 */
import type { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { hrTools } from './tools/index.js';
import { registerHrEventHandlers } from './events/subscribers.js';
import { getHrSystemPromptFragment } from './prompts/hrContext.js';
import hrRouter from './routes/index.js';

export const hrModule: PlatformModule = {
  namespace: 'hr',
  displayName: 'HR & Recruitment',
  requiredRoles: ['hr', 'manager', 'admin'],

  registerTools(): ToolRegistration[] {
    return hrTools;
  },

  getRouter(): Router {
    return hrRouter;
  },

  registerEventHandlers(eventBus: EventBus): void {
    registerHrEventHandlers(eventBus);
  },

  getSystemPromptFragment(userRole: string): string {
    return getHrSystemPromptFragment(userRole);
  },
};

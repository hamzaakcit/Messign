/**
 * Time Module — Platform plugin (stub)
 * Wraps existing time routes. Tools and prompts to be migrated.
 */
import { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import timeRouter from '../../routes/time/index.js';

export const timeModule: PlatformModule = {
  namespace: 'time',
  displayName: 'Time Tracking',
  requiredRoles: [],

  registerTools(): ToolRegistration[] {
    return [];
  },

  getRouter(): Router {
    return timeRouter;
  },

  registerEventHandlers(_eventBus: EventBus): void {
    // Event handlers for time.* events when ready
  },

  getSystemPromptFragment(userRole: string): string {
    return `You are the Time specialist. Current role: ${userRole}. Capabilities: entries, timers, utilization.`;
  },
};

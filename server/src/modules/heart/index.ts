/**
 * Heart Module — Platform plugin (stub)
 * Wraps existing heart routes. Tools and prompts to be migrated.
 */
import { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { heartRouter } from '../../routes/heart/index.js';

export const heartModule: PlatformModule = {
  namespace: 'heart',
  displayName: 'Dora Heart',
  requiredRoles: [],

  registerTools(): ToolRegistration[] {
    return [];
  },

  getRouter(): Router {
    return heartRouter;
  },

  registerEventHandlers(_eventBus: EventBus): void {
    // Event handlers for heart.* events when ready
  },

  getSystemPromptFragment(userRole: string): string {
    return `You are the Heart/wellness specialist. Current role: ${userRole}. Capabilities: team health, sentiment, burnout, pulse.`;
  },
};

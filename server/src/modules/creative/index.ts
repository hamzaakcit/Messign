/**
 * Creative Hub — Platform module (image generation: Replicate / Flux / OpenAI).
 */
import type { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { creativeTools } from './tools/index.js';
import { registerCreativeEventHandlers } from './events/subscribers.js';
import { getCreativeSystemPromptFragment } from './prompts/creativeContext.js';
import creativeRouter from './routes/index.js';

export const creativeModule: PlatformModule = {
  namespace: 'creative',
  displayName: 'Creative Hub',
  requiredRoles: ['manager', 'admin'],

  registerTools(): ToolRegistration[] {
    return creativeTools;
  },

  getRouter(): Router {
    return creativeRouter;
  },

  registerEventHandlers(eventBus: EventBus): void {
    registerCreativeEventHandlers(eventBus);
  },

  getSystemPromptFragment(userRole: string): string {
    return getCreativeSystemPromptFragment(userRole);
  },
};

// Re-export barrel — all logic moved to ./registry/ for single-responsibility modules.
// This file kept for backward compatibility; all existing imports continue to work.
export type { IntentCategory, Surface, RoleRequirement, IntentEntry } from './registry/index';
export { INTENT_REGISTRY, getIntentById } from './registry/index';

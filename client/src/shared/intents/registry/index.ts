// Barrel — merges domain arrays into INTENT_REGISTRY and re-exports types + lookup.

export type { IntentCategory, Surface, RoleRequirement, IntentEntry } from './types';

export { GLOBAL_INTENTS } from './globalIntents';
export { WORKSPACE_INTENTS } from './workspaceIntents';
export { DOMAIN_INTENTS } from './domainIntents';

import type { IntentEntry } from './types';
import { GLOBAL_INTENTS } from './globalIntents';
import { WORKSPACE_INTENTS } from './workspaceIntents';
import { DOMAIN_INTENTS } from './domainIntents';
import { initLookup, getIntentById as _getIntentById } from './lookup';

export const INTENT_REGISTRY: IntentEntry[] = [
  ...GLOBAL_INTENTS,
  ...WORKSPACE_INTENTS,
  ...DOMAIN_INTENTS,
];

initLookup(INTENT_REGISTRY);

export { _getIntentById as getIntentById };

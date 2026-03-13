/**
 * Module Registry — Domain plugin exports
 * Import this to load all registered modules.
 */
export { crmModule } from './crm/index.js';
export { supportModule } from './support/index.js';
export { financeModule } from './finance/index.js';
export { hrModule } from './hr/index.js';
export { marketingModule } from './marketing/index.js';
export { knowledgeModule } from './knowledge/index.js';
export { timeModule } from './time/index.js';
export { okrModule } from './okr/index.js';
export { heartModule } from './heart/index.js';
export { executiveModule } from './executive/index.js';
export { initializeModules, getModulePrompt, getAccessibleModules } from './registry.js';
export type { PlatformModule, ToolRegistration } from './types.js';

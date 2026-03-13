/**
 * Specialist Agent Registry
 *
 * Maps module namespaces to specialist agents.
 * Add specialists as modules are migrated.
 */
import type { SpecialistAgent } from './types.js';
import { crmAgent } from './specialists/crmAgent.js';
import { supportAgent } from './specialists/supportAgent.js';
// import { financeAgent } from './specialists/financeAgent.js';
// ... add as modules are migrated

const specialists: Map<string, SpecialistAgent> = new Map();

export function registerSpecialist(agent: SpecialistAgent): void {
  specialists.set(agent.namespace, agent);
}

export function getSpecialist(namespace: string): SpecialistAgent | undefined {
  return specialists.get(namespace);
}

// Initialize at startup
registerSpecialist(crmAgent);
registerSpecialist(supportAgent);

/**
 * Specialist Registry — Map namespace → SpecialistAgent
 */

import type { SpecialistAgent } from './types.js';
import { crmAgent } from './specialists/crmAgent.js';
import { supportAgent } from './specialists/supportAgent.js';
import { hrAgent } from './specialists/hrAgent.js';
import { marketingAgent } from './specialists/marketingAgent.js';
import { financeAgent } from './specialists/financeAgent.js';
import { timeAgent } from './specialists/timeAgent.js';
import { okrAgent } from './specialists/okrAgent.js';
import { assetsAgent } from './specialists/assetsAgent.js';
import { contractsAgent } from './specialists/contractsAgent.js';
import { heartAgent } from './specialists/heartAgent.js';

const specialists = new Map<string, SpecialistAgent>([
  ['crm', crmAgent],
  ['support', supportAgent],
  ['hr', hrAgent],
  ['marketing', marketingAgent],
  ['finance', financeAgent],
  ['time', timeAgent],
  ['okr', okrAgent],
  ['assets', assetsAgent],
  ['contracts', contractsAgent],
  ['heart', heartAgent],
]);

export function getSpecialist(namespace: string): SpecialistAgent | null {
  return specialists.get(namespace) ?? null;
}

export function getRegisteredNamespaces(): string[] {
  return Array.from(specialists.keys());
}

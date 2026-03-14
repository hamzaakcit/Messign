import { getContractRenewals, extractContractTerms } from './contractTools.js';
import type { ToolRegistration } from '../../types.js';

export const contractTools: ToolRegistration[] = [
  getContractRenewals,
  extractContractTerms,
];

/**
 * Support Module — Tool registrations
 */
import { getTicketOverview, getCustomerHealth, getSupportMetrics } from './supportTools.js';
import type { ToolRegistration } from '../../types.js';

export const supportTools: ToolRegistration[] = [
  getTicketOverview,
  getCustomerHealth,
  getSupportMetrics,
];

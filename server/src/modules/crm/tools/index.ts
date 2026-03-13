/**
 * CRM Module — Tool registrations
 */
import { searchDeals } from './searchDeals.js';
import {
  getPipelineStatus,
  getDealDetails,
  getSalesForecast,
  getActivityGaps,
} from './pipelineTools.js';
import type { ToolRegistration } from '../../types.js';

export const crmTools: ToolRegistration[] = [
  searchDeals,
  getPipelineStatus,
  getDealDetails,
  getSalesForecast,
  getActivityGaps,
];

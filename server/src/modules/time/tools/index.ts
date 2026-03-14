import { getTimeSummary, getUtilizationReport, suggestTimeAllocation } from './timeTools.js';
import type { ToolRegistration } from '../../types.js';

export const timeTools: ToolRegistration[] = [
  getTimeSummary,
  getUtilizationReport,
  suggestTimeAllocation,
];

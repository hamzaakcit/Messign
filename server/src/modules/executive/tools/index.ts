import { getExecutiveDashboardTool, generateDailyBriefingTool, getAiMetricsTool } from './executiveTools.js';
import { crossModuleQuery } from './crossModuleQuery.js';
import type { ToolRegistration } from '../../types.js';

export const executiveTools: ToolRegistration[] = [
  getExecutiveDashboardTool,
  generateDailyBriefingTool,
  getAiMetricsTool,
  crossModuleQuery,
];

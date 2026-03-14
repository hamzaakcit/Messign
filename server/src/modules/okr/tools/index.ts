import { getOKRMetrics, listOKRGoals, getOKRGoalTree } from './okrTools.js';
import type { ToolRegistration } from '../../types.js';

export const okrTools: ToolRegistration[] = [
  getOKRMetrics,
  listOKRGoals,
  getOKRGoalTree,
];

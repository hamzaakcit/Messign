/**
 * HR Module — Tool registrations
 */
import {
  getHiringPipeline,
  scoreCandidate,
  getRecruitmentMetrics,
  getCrossModuleReport,
  compareEmployees,
} from './hrTools.js';
import type { ToolRegistration } from '../../types.js';

export const hrTools: ToolRegistration[] = [
  getHiringPipeline,
  scoreCandidate,
  getRecruitmentMetrics,
  getCrossModuleReport,
  compareEmployees,
];

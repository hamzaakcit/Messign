import { getTeamSentiment, getBurnoutRisk, getCultureScore, getMyWellness, sendPulseSurvey } from './heartTools.js';
import type { ToolRegistration } from '../../types.js';

export const heartTools: ToolRegistration[] = [
  getTeamSentiment,
  getBurnoutRisk,
  getCultureScore,
  getMyWellness,
  sendPulseSurvey,
];

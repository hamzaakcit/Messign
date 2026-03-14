import { getCampaignPerformance, getMarketingRoi, suggestContentTopics } from './marketingTools.js';
import type { ToolRegistration } from '../../types.js';

export const marketingTools: ToolRegistration[] = [
  getCampaignPerformance,
  getMarketingRoi,
  suggestContentTopics,
];

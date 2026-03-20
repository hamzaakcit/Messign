import { getCampaignPerformance, getMarketingRoi, suggestContentTopics } from './marketingTools.js';
import {
  brandVoiceCheck,
  complianceScan,
  competitorContentScan,
  productTruthLookup,
  validateProductTruth,
} from './contentStrategistTools.js';
import type { ToolRegistration } from '../../types.js';

export const marketingTools: ToolRegistration[] = [
  getCampaignPerformance,
  getMarketingRoi,
  suggestContentTopics,
  productTruthLookup,
  brandVoiceCheck,
  validateProductTruth,
  complianceScan,
  competitorContentScan,
];

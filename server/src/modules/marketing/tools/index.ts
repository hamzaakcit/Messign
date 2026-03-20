import { getCampaignPerformance, getMarketingRoi, suggestContentTopics } from './marketingTools.js';
import {
  brandVoiceCheck,
  complianceScan,
  competitorContentScan,
  productTruthLookup,
  validateProductTruth,
} from './contentStrategistTools.js';
import { generateImageBrief, checkBrandCompliance, repurposeContent } from './creativeTools.js';
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
  generateImageBrief,
  checkBrandCompliance,
  repurposeContent,
];

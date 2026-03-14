import { getAssetSummary, getLicenseUtilization } from './assetTools.js';
import type { ToolRegistration } from '../../types.js';

export const assetTools: ToolRegistration[] = [
  getAssetSummary,
  getLicenseUtilization,
];

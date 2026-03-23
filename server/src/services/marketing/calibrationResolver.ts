/**
 * Calibration Resolver
 *
 * Single entry point for getting the calibration prompt text.
 * Checks cache first, falls back to computing from DB.
 */

import { query } from '../../db/index.js';
import {
  getPerformanceContext,
  generateCalibrationPrompt,
} from './performanceCollector.js';
import type { CalibrationPrompt } from './performanceCollector.js';
import {
  getCachedCalibration,
  setCachedCalibration,
} from './calibrationCache.js';

/**
 * Resolve the calibration prompt for a workspace+channel.
 *
 * 1. Check in-memory cache
 * 2. If miss: query DB → generate calibration → cache
 * 3. Return the calibration prompt text
 */
export async function resolveCalibrationPrompt(
  organizationId: string,
  channel: string = 'email',
  brandProfileId: string | undefined,
): Promise<CalibrationPrompt> {
  const cached = getCachedCalibration(
    organizationId,
    channel,
    brandProfileId,
  );
  if (cached) return cached;

  const context = await getPerformanceContext(
    organizationId,
    { channel, brandProfileId },
    { query },
  );

  const prompt = generateCalibrationPrompt(context);

  setCachedCalibration(organizationId, channel, prompt, brandProfileId);

  return prompt;
}

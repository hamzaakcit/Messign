/**
 * Calibration Resolver
 *
 * Single entry point for getting the calibration prompt text.
 * Checks cache first, then prefers a Phase 7 `calibration_snapshots` row when
 * enough data exists; otherwise falls back to `performance_feedback` aggregates.
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
import { getLatestCalibrationSnapshot } from '../../dal/marketing/calibrationSnapshots.js';
import { formatCalibrationSnapshotPrompt } from '../../modules/marketing/prompts/formatCalibrationSnapshotPrompt.js';

/** Minimum sends in snapshot for statistically useful calibration prompts. */
const MIN_SNAPSHOT_EMAILS_SENT = 150;

/**
 * Resolve the calibration prompt for a workspace+channel.
 *
 * 1. Check in-memory cache
 * 2. If email channel + no brand filter: try latest `calibration_snapshots` (Phase 7)
 * 3. Else: aggregate `performance_feedback` → generate calibration → cache
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

  if (
    channel === 'email' &&
    !brandProfileId
  ) {
    const snapshot = await getLatestCalibrationSnapshot(organizationId);
    if (
      snapshot &&
      snapshot.emails_sent >= MIN_SNAPSHOT_EMAILS_SENT
    ) {
      const text = formatCalibrationSnapshotPrompt(snapshot);
      const generatedAt =
        snapshot.snapshot_date instanceof Date
          ? snapshot.snapshot_date.toISOString()
          : String(snapshot.snapshot_date);
      const prompt: CalibrationPrompt = {
        text,
        generatedAt,
        basedOnRecords: snapshot.emails_sent,
      };
      setCachedCalibration(organizationId, channel, prompt, brandProfileId);
      return prompt;
    }
  }

  const context = await getPerformanceContext(
    organizationId,
    { channel, brandProfileId },
    { query },
  );

  const prompt = generateCalibrationPrompt(context);

  setCachedCalibration(organizationId, channel, prompt, brandProfileId);

  return prompt;
}

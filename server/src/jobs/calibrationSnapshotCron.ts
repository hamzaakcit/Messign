import cron from 'node-cron';
import { enqueueJob, JOB_NAMES } from '../services/jobQueue.js';

/**
 * Enqueues the calibration snapshot job every Monday at 03:00 (server timezone).
 * Disable with `CALIBRATION_SNAPSHOT_CRON_ENABLED=0`.
 */
export function startCalibrationSnapshotCron(): void {
  if (process.env.CALIBRATION_SNAPSHOT_CRON_ENABLED === '0') {
    console.log(
      '[CalibrationSnapshotCron] Disabled (CALIBRATION_SNAPSHOT_CRON_ENABLED=0)',
    );
    return;
  }

  cron.schedule(
    '0 3 * * 1',
    () => {
      void enqueueJob(JOB_NAMES.CALIBRATION_SNAPSHOT, {}).catch((err: unknown) => {
        console.error(
          '[CalibrationSnapshotCron] enqueue failed:',
          err instanceof Error ? err.message : err,
        );
      });
    },
    { timezone: process.env.CALIBRATION_SNAPSHOT_TZ || 'UTC' },
  );

  console.log(
    '[CalibrationSnapshotCron] Weekly schedule: Monday 03:00 (UTC unless CALIBRATION_SNAPSHOT_TZ set)',
  );
}

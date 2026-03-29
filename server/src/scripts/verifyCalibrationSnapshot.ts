/**
 * One-off: apply migration is done via `npm run db:migrate-runner`.
 * This script verifies `runCalibrationSnapshot` + `resolveCalibrationPrompt` against the DB.
 *
 * Usage: `npx tsx src/scripts/verifyCalibrationSnapshot.ts [organizationId]`
 */
import '../env.js';
import { query } from '../db/index.js';
import { runCalibrationSnapshot } from '../jobs/calibrationSnapshotJob.js';
import { resolveCalibrationPrompt } from '../services/marketing/calibrationResolver.js';

async function main(): Promise<void> {
  const argOrg = process.argv[2]?.trim();

  const tableOk = await query(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'calibration_snapshots'`,
  );
  console.log(
    '[verifyCalibrationSnapshot] table calibration_snapshots:',
    tableOk.rows.length ? 'exists' : 'MISSING',
  );

  let orgId = argOrg;
  if (!orgId) {
    const r = await query(
      `SELECT organization_id::text AS id FROM performance_feedback WHERE channel = 'email' LIMIT 1`,
    );
    if (!r.rows.length) {
      console.log(
        '[verifyCalibrationSnapshot] No email performance_feedback rows — pass an org UUID or seed metrics.',
      );
      process.exit(0);
      return;
    }
    orgId = String((r.rows[0] as { id: string }).id);
  }

  console.log('[verifyCalibrationSnapshot] org:', orgId);
  await runCalibrationSnapshot(orgId);

  const snap = await query(
    `SELECT id, emails_sent, snapshot_date FROM calibration_snapshots
     WHERE organization_id = $1 ORDER BY snapshot_date DESC LIMIT 1`,
    [orgId],
  );
  console.log('[verifyCalibrationSnapshot] latest snapshot:', snap.rows[0] ?? null);

  const cal = await resolveCalibrationPrompt(orgId, 'email', undefined);
  console.log('[verifyCalibrationSnapshot] basedOnRecords:', cal.basedOnRecords);
  console.log('[verifyCalibrationSnapshot] text preview:\n', cal.text.slice(0, 600));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

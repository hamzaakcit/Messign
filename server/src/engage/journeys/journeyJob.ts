import { JOB_NAMES, enqueueJob, getQueue, registerJobHandler, scheduleJob } from '../../services/jobQueue.js';
import { logInfo } from '../log.js';
import { dispatchDueAcrossTenants } from '../messaging/dispatch.js';
import { runJourneyTick } from './engine.js';

/**
 * The journey executor's wake-up (WP-16, ADR-012). pg-boss runs the tick every minute; ingestion and the trigger API
 * also ask for one right away so a new enrollment does not wait for the minute. The tick itself finds its work in the
 * database, so a lost or doubled wake-up changes nothing but latency. After the journeys it runs the dispatcher (WP-17),
 * which sends due messages through the send gate; with SEND_MODE off it does nothing.
 */
export async function registerEngageJourneyHandler(): Promise<void> {
  await registerJobHandler(JOB_NAMES.ENGAGE_JOURNEY_TICK, async () => {
    const s = await runJourneyTick();
    if (s.triggers || s.runs || s.errors) logInfo('journey tick', { ...s });
    const sent = await dispatchDueAcrossTenants();
    if (Object.keys(sent).length) logInfo('dispatch tick', sent);
  }, { batchSize: 1 });
  await scheduleJob(JOB_NAMES.ENGAGE_JOURNEY_TICK, '* * * * *');
  logInfo('journey tick handler registered');
}

/** Best effort: without the queue (tests, ENABLE_PG_BOSS=false) the scheduled tick is the only wake-up. */
export function requestJourneyTick(): void {
  try { getQueue(); } catch { return; }
  void enqueueJob(JOB_NAMES.ENGAGE_JOURNEY_TICK, {}, { singletonKey: 'engage-journey-tick', retryLimit: 0 });
}

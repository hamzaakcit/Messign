/**
 * The alert drill (WP-29, docs/runbooks/ops-monitoring.md): proves that the operators' channel receives what the ops check sends.
 * It posts one message that says it is a drill to ENGAGE_ALERT_WEBHOOK_URL, and with --heartbeat pings ENGAGE_OPS_HEARTBEAT_URL.
 * It reads no tenant data and writes nothing. The URLs are secrets: they are never printed.
 *
 *   npm run engage:ops-drill -- --send-test [--heartbeat]
 */
import 'dotenv/config';
import { alertWebhookUrl, pingHeartbeat, sendToOperators } from '../engage/ops/notify.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (!args.includes('--send-test') && !args.includes('--heartbeat')) { console.error('Usage: npm run engage:ops-drill -- --send-test [--heartbeat]'); process.exit(2); }
  if (args.includes('--send-test')) {
    if (!alertWebhookUrl()) { console.error('ENGAGE_ALERT_WEBHOOK_URL is not set (or is not an https URL): nobody would be told. Set it on the server and here.'); process.exit(1); }
    const text = 'Messign Engage ops: DRILL, not a real alert. If you can read this, the alert channel works.';
    const d = await sendToOperators(text, [{ kind: 'opened', tenant: 'drill', rule: 'drill', severity: 'warning', text: 'drill' }]);
    console.log(d.ok ? 'The test message was accepted by the webhook. Check that it appeared where the operators look.' : 'The webhook did not take the message (see the log line above).');
    if (!d.ok) process.exit(1);
  }
  if (args.includes('--heartbeat')) {
    if (!process.env.ENGAGE_OPS_HEARTBEAT_URL) { console.error('ENGAGE_OPS_HEARTBEAT_URL is not set.'); process.exit(1); }
    await pingHeartbeat();
    console.log('The heartbeat was pinged (a failure would have been logged above).');
  }
}
main().then(() => process.exit(0), (err) => { console.error('[engage] ops drill failed:', err instanceof Error ? err.name : 'error'); process.exit(1); });

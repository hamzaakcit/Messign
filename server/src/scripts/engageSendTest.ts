/**
 * Sends ONE test message through the real pipeline (send gate -> SES adapter) and follows its delivery report.
 * Always runs in SEND_MODE=sandbox (forced here, never live), so the gate requires: a test-mode account, send_enabled,
 * a rate card and budget cap, and the recipient on the sandbox allow-list. SES itself (sandbox) only delivers to
 * verified addresses. The recipient is never printed; only outcome codes are.
 *
 *   npm run engage:send-test -- --org <org uuid> --account <channel account id> --to <allow-listed address> --ask-master-key
 *
 * Needs ENGAGE_DATABASE_URL, and the production master key (typed at hidden prompts with --ask-master-key).
 */
import 'dotenv/config';
import { closeEngagePool } from '../engage/db.js';
import { promptHidden } from './hiddenPrompt.js';

const arg = (name: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v || v.startsWith('--')) { console.error(`Missing --${name}`); process.exit(2); }
  return v;
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main(): Promise<void> {
  const org = arg('org');
  const account = arg('account');
  const to = arg('to');
  if (!UUID_RE.test(org) || !UUID_RE.test(account)) { console.error('--org and --account must be UUIDs'); process.exit(2); }
  process.env.SEND_MODE = 'sandbox'; // never live from this script
  if (process.argv.includes('--ask-master-key')) {
    process.env.ENGAGE_MASTER_KEY = await promptHidden('ENGAGE_MASTER_KEY (hidden): ');
    process.env.ENGAGE_MASTER_KEY_ID = await promptHidden('ENGAGE_MASTER_KEY_ID (hidden): ');
  }
  const M = await import('../engage/messaging/index.js');
  const { upsertProfile } = await import('../engage/profiles.js');

  const profile = await upsertProfile(org, { externalId: 'send-test-recipient', email: to });
  const stamp = new Date().toISOString();
  const { message } = await M.createMessage(org, {
    profileId: profile.id, channel: 'email', purpose: 'transactional', channelAccountId: account,
    idempotencyKey: `send-test-${Date.now()}`, ttlSeconds: 3600,
    content: {
      subject: 'Messign Engage test message',
      text: `This is a test message from Messign Engage (sandbox). Sent ${stamp}.`,
      html: `<p>This is a test message from <b>Messign Engage</b> (sandbox).</p><p>Sent ${stamp}.</p>`,
    },
  });
  console.log(`[engage] message ${message.id} created`);
  const result = await M.dispatchMessage(org, message.id);
  console.log('[engage] dispatch:', result.outcome, 'code' in result ? `(${result.code})` : '');
  if (result.outcome !== 'sent') {
    console.log('  The gate or the adapter stopped it. Common causes: send_enabled false, no rate card or budget cap, recipient not on the allow-list, account not in test mode, SES identity not verified yet.');
    await closeEngagePool();
    return;
  }
  console.log('[engage] handed to SES. Waiting up to 90 s for the delivery report (SES -> SNS -> webhook)...');
  const end = Date.now() + 90_000;
  let last = '';
  while (Date.now() < end) {
    const got = await M.getMessage(org, message.id);
    const line = `${got.message.status} [${got.events.map((e) => e.type).join(', ')}]`;
    if (line !== last) { console.log(`  status: ${line}`); last = line; }
    if (['delivered', 'bounced', 'failed'].includes(got.message.status)) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log(last.startsWith('delivered') ? '[engage] DELIVERED: the whole path works.' : '[engage] No final report yet. Check the inbox, and the server log for "webhook".');
  await closeEngagePool();
}

main().catch((err) => { console.error('[engage] send-test failed:', err instanceof Error ? err.message : err); process.exit(1); });

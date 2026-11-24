/**
 * The live check of the WhatsApp channel with a Meta test number (WP-27, docs/runbooks/whatsapp.md), from your own terminal.
 * It runs the real pipeline (send gate, WhatsApp adapter, Meta) in SEND_MODE=sandbox, forced here, never live. The number
 * you give is yours: it is never printed, only outcome codes are.
 *
 *   npm run engage:whatsapp-check -- --org <org uuid> --account <whatsapp account id> --to +90... --prepare --ask-master-key
 *       --prepare   makes the tenant ready for the check (once): WhatsApp rate cards and a budget cap if there are none,
 *                   send_enabled, your number on the sandbox allow-list, and a profile for it with WhatsApp consent
 *                   (evidence says it is a live check on the runner's own number).
 *   npm run engage:whatsapp-check -- --org ... --account ... --to +90... --ask-master-key
 *       sends one template message (default Meta's sample template jaspers_market_order_confirmation_v1, en_US, with its three values; --template, --language, --param (repeat per variable) and --purpose to change) and follows
 *       its delivery reports for two minutes (they arrive through the webhook on the server).
 *   npm run engage:whatsapp-check -- --org ... --account ... --webhooks --waba <WhatsApp Business Account id> [--subscribe] --ask-master-key
 *       asks Meta which apps are subscribed to the WhatsApp Business Account (delivery reports reach the webhook only when this
 *       app is), and with --subscribe subscribes it. Sends nothing; the stored access token is used and never printed.
 *   npm run engage:whatsapp-check -- --org ... --account ... --to +90... --report --ask-master-key
 *       prints, without sending, what is recorded: consent, messages and what the webhook did with your replies.
 *
 * For the WP-40 live check (docs/runbooks/whatsapp.md, "Live check of templates"):
 *   --rotate [--config waba_id=<id>] [--config daily_recipient_limit=<n>]
 *       rotates the account: asks for a new access token at a hidden prompt (Enter keeps the current one), keeps the app secret
 *       and verify token, and merges the config changes. Prints the new account id; Meta's callback URL keeps working.
 *   --templates
 *       runs the template check against Meta (the same one as Settings > WhatsApp > Check now) and prints what Meta lists
 *       (names, status, category, quality, the shape of variables and buttons), the template events received (by the check or
 *       Meta's webhook) and the Settings checklist. Sends nothing.
 *   --header-param <value> / --button-param <value>
 *       with a send: the value of the template's text-header variable and of its URL button's variable.
 *
 * Needs ENGAGE_DATABASE_URL and the production master key (typed at hidden prompts with --ask-master-key).
 */
import 'dotenv/config';
import { closeEngagePool, withEngageTenant } from '../engage/db.js';
import { ArgError, parseWhatsappCheckArgs } from './engageWhatsappCheckArgs.js';
import { promptHidden } from './hiddenPrompt.js';

async function main(): Promise<void> {
  const a = parseWhatsappCheckArgs(process.argv.slice(2));
  process.env.SEND_MODE = 'sandbox'; // never live from this script
  if (a.askMasterKey) {
    process.env.ENGAGE_MASTER_KEY = await promptHidden('ENGAGE_MASTER_KEY (hidden): ');
    process.env.ENGAGE_MASTER_KEY_ID = await promptHidden('ENGAGE_MASTER_KEY_ID (hidden): ');
  }
  const M = await import('../engage/messaging/index.js');
  const P = await import('../engage/profiles.js');

  const acct = (await withEngageTenant(a.org, (c) => c.query<{ provider: string; mode: string; channel: string }>(
    `SELECT provider, mode, channel FROM engage.channel_accounts WHERE id = $1 AND status = 'active'`, [a.account]))).rows[0];
  if (!acct || acct.channel !== 'whatsapp' || acct.provider !== 'whatsapp_cloud') { console.error('[engage] that is not an active whatsapp_cloud account of this tenant'); process.exit(2); }
  if (acct.mode !== 'test') { console.error('[engage] this check runs on a test-mode account (a Meta test number); the account is in live mode'); process.exit(2); }

  if (a.webhooks) {
    const { loadAccountSecrets } = await import('../engage/credentials.js');
    const { account, secrets } = await loadAccountSecrets(a.org, a.account);
    const version = String(account.config.api_version ?? 'v25.0');
    const url = `https://graph.facebook.com/${version}/${a.waba}/subscribed_apps`;
    const call = async (method: 'GET' | 'POST') => {
      const res = await fetch(url, { method, headers: { authorization: `Bearer ${secrets.access_token}`, 'content-type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(15_000) });
      const body = await res.json().catch(() => null) as { data?: Array<{ whatsapp_business_api_data?: { id?: string; name?: string } }>; success?: boolean; error?: { code?: number } } | null;
      return { status: res.status, body };
    };
    const show = (label: string, r: Awaited<ReturnType<typeof call>>) => {
      if (r.status >= 400 || r.body?.error) { console.log(`[engage] ${label}: Meta answered ${r.status}, error code ${r.body?.error?.code ?? 'unknown'}`); return; }
      const apps = (r.body?.data ?? []).map((d) => `${d.whatsapp_business_api_data?.name ?? '?'} (${d.whatsapp_business_api_data?.id ?? '?'})`);
      console.log(`[engage] ${label}: ${r.body?.success !== undefined ? `success=${r.body.success}` : `${apps.length} app(s) subscribed to this account${apps.length ? `: ${apps.join(', ')}` : ''}`}`);
    };
    show('before', await call('GET'));
    if (a.subscribe) { show('subscribe', await call('POST')); show('after', await call('GET')); }
    else console.log('  Add --subscribe to subscribe this app to the account if it is not listed.');
    await closeEngagePool();
    return;
  }

  if (a.rotate) {
    const { loadAccountSecrets, rotateAccount } = await import('../engage/credentials.js');
    const { account, secrets } = await loadAccountSecrets(a.org, a.account);
    const token = (await promptHidden('New access_token (hidden; press Enter to keep the current one): ')).trim();
    if (!token && Object.keys(a.config).length === 0) { console.log('[engage] nothing to change: give a new token or --config'); await closeEngagePool(); return; }
    const next = await rotateAccount(a.org, null, a.account, { secrets: { ...secrets, ...(token ? { access_token: token } : {}) }, config: { ...account.config, ...a.config } });
    console.log(`[engage] rotated: ${token ? 'new access token, ' : ''}${Object.keys(a.config).length ? `config ${Object.keys(a.config).join(', ')} set` : 'same config'}`);
    console.log(`  new account id: ${next.id}  (use it in the next commands)`);
    console.log(`  config: ${Object.entries(next.config).map(([k, v]) => `${k}=${String(v)}`).join(' ')}`);
    console.log('  Meta\'s callback URL with the old id keeps working: it follows the rotation.');
    await closeEngagePool();
    return;
  }

  if (a.templates) {
    const { runTemplateCheck } = await import('../engage/whatsapp/templateCheck.js');
    const { listTemplateStatuses } = await import('../engage/whatsapp/templateStatus.js');
    const { getWhatsappSetup } = await import('../engage/whatsapp/operate.js');
    const r = await runTemplateCheck(a.org);
    console.log(r.ok
      ? `[engage] template check: OK, ${r.seen} template(s) listed by Meta, ${r.changed} changed`
      : `[engage] template check FAILED: ${r.error} (${r.state.consecutiveFailures} in a row). wa_190 token refused; wa_10/wa_200 the token may not read templates (whatsapp_business_management); wa_100 wrong waba_id; waba_missing: rotate with --config waba_id=<id>`);
    for (const t of await listTemplateStatuses(a.org)) {
      const sh = t.shape;
      console.log(`  ${t.metaName} (${t.language}): ${t.status}, ${t.category ?? '?'}${t.correctCategory ? ` -> ${t.correctCategory}` : ''}, quality ${t.quality ?? '?'}`
        + `; body variables ${sh.bodyVariables ?? '?'}, header ${sh.headerFormat ?? 'none'}${sh.headerVariables ? ` with ${sh.headerVariables} variable` : ''}`
        + `, URL-button variables ${sh.urlButtonVariables ?? 0}, buttons [${(sh.buttons ?? []).join(', ')}], parameters ${sh.parameterFormat ?? '?'}`);
    }
    const events = (await withEngageTenant(a.org, (c) => c.query<{ meta_name: string; language: string; event: string; status: string | null; source: string; applied: boolean; occurred_at: Date }>(
      `SELECT meta_name, language, event, status, source, applied, occurred_at FROM engage.whatsapp_template_events WHERE organization_id = $1 ORDER BY recorded_at DESC, id DESC LIMIT 15`, [a.org]))).rows;
    for (const e of events) console.log(`  event: ${e.meta_name} (${e.language}) ${e.event}${e.status ? ` -> ${e.status}` : ''} via ${e.source}${e.applied ? '' : ' (recorded, not applied)'} at ${e.occurred_at.toISOString()}`);
    if (!events.length) console.log('  event: none recorded yet');
    const v = await getWhatsappSetup(a.org);
    console.log(`[engage] Settings checklist: ${v.steps.map((s) => `${s.done ? 'done' : 'TODO'} ${s.step}`).join(', ')}`);
    console.log(`  last template update from Meta's webhook: ${v.webhook.lastTemplateUpdateAt ?? 'none yet'}; last delivery report: ${v.webhook.lastDeliveryReportAt ?? 'none yet'}`);
    if (v.pacing) console.log(`  daily limit: ${v.pacing.contacted24h} of ${v.pacing.limit} customers in 24 hours${v.pacing.limitIsDefault ? ' (default)' : ''}, ${v.pacing.waiting} waiting`);
    await closeEngagePool();
    return;
  }

  // The number may already belong to a customer of this organization (one added in the web app, for example): use that profile, not a
  // second one, which the identifier rules refuse ("That phone already belongs to another profile").
  const phone = P.normalizePhone(a.to);
  const owner = phone === null ? null : (await withEngageTenant(a.org, (c) => c.query<{ external_id: string }>(
    `SELECT p.external_id FROM engage.identifiers i JOIN engage.profiles p ON p.organization_id = i.organization_id AND p.id = i.profile_id
      WHERE i.organization_id = $1 AND i.type = 'phone' AND i.value_normalized = $2 AND i.is_active`, [a.org, phone]))).rows[0];
  const profile = await P.upsertProfile(a.org, { externalId: owner?.external_id ?? 'whatsapp-live-check', phone: a.to });

  if (a.prepare) {
    const have = await withEngageTenant(a.org, async (c) => ({
      cards: (await c.query(`SELECT 1 FROM engage.rate_cards WHERE organization_id = $1 AND channel = 'whatsapp'`, [a.org])).rowCount ?? 0,
      granted: (await c.query(`SELECT 1 FROM engage.consent_state WHERE organization_id = $1 AND profile_id = $2 AND channel = 'whatsapp' AND status = 'granted'`, [a.org, profile.id])).rowCount ?? 0,
    }));
    if (!have.cards) for (const category of ['marketing', 'transactional'] as const) await M.addRateCard(a.org, { channel: 'whatsapp', category, unitCostMinor: 1, currency: 'TRY' });
    await M.setBudgetCap(a.org, 'whatsapp', 100_000, 'TRY');
    await withEngageTenant(a.org, (c) => c.query(`UPDATE engage.tenant_settings SET send_enabled = true WHERE organization_id = $1`, [a.org]));
    await M.addAllowlistEntry(a.org, 'whatsapp', a.to, { label: 'live check' });
    if (!have.granted) {
      await P.recordConsent(a.org, profile.id, { channel: 'whatsapp', status: 'granted', source: 'api', evidence: { live_check: true, note: 'consent of the person running the live check, for their own number', at: new Date().toISOString() } });
    }
    console.log('[engage] prepared: rate cards and budget cap, send_enabled, allow-list entry, profile and WhatsApp consent.');
  }

  if (a.report) {
    const view = await withEngageTenant(a.org, async (c) => ({
      consent: (await c.query<{ status: string; updated_at: Date }>(`SELECT status, updated_at FROM engage.consent_state WHERE organization_id = $1 AND profile_id = $2 AND channel = 'whatsapp'`, [a.org, profile.id])).rows[0],
      ledger: (await c.query<{ status: string; source: string; recorded_at: Date; via: string | null }>(
        `SELECT status, source, recorded_at, evidence->>'via' AS via FROM engage.consents WHERE organization_id = $1 AND profile_id = $2 AND channel = 'whatsapp' ORDER BY recorded_at, id`, [a.org, profile.id])).rows,
      suppressed: ((await c.query(`SELECT 1 FROM engage.suppressions WHERE organization_id = $1 AND channel = 'whatsapp'`, [a.org])).rowCount ?? 0) > 0,
      messages: (await c.query<{ id: string; status: string; purpose: string; created_at: Date }>(`SELECT id, status, purpose, created_at FROM engage.messages WHERE organization_id = $1 AND profile_id = $2 ORDER BY created_at DESC LIMIT 5`, [a.org, profile.id])).rows,
      inbound: (await c.query<{ kind: string; outcome: string; occurred_at: Date }>(`SELECT kind, outcome, occurred_at FROM engage.inbound_events WHERE organization_id = $1 ORDER BY received_at DESC LIMIT 10`, [a.org])).rows,
    }));
    console.log(`[engage] WhatsApp consent: ${view.consent?.status ?? 'none'}${view.suppressed ? ' (a number is suppressed for WhatsApp)' : ''}`);
    for (const l of view.ledger) console.log(`  ledger: ${l.status} via ${l.source}${l.via ? ` (${l.via})` : ''} at ${l.recorded_at.toISOString()}`);
    for (const m of view.messages) console.log(`  message ${m.id}: ${m.status} (${m.purpose}) ${m.created_at.toISOString()}`);
    for (const i of view.inbound) console.log(`  inbound: ${i.kind} -> ${i.outcome} at ${i.occurred_at.toISOString()}`);
    if (!view.inbound.length) console.log('  inbound: nothing yet (no reply, preference change or handshake-signed delivery has reached the server)');
    await closeEngagePool();
    return;
  }

  const { message } = await M.createMessage(a.org, {
    profileId: profile.id, channel: 'whatsapp', purpose: a.purpose, channelAccountId: a.account,
    idempotencyKey: `whatsapp-check-${Date.now()}`, ttlSeconds: 3600, content: {
      template: a.template, language: a.language, ...(a.params.length ? { body_parameters: a.params } : {}),
      ...(a.headerParam !== null ? { header_parameter: a.headerParam } : {}), ...(a.buttonParam !== null ? { url_button_parameter: a.buttonParam } : {}),
    },
  });
  console.log(`[engage] message ${message.id} created (${a.purpose}, template ${a.template}, ${a.language})`);
  const result = await M.dispatchMessage(a.org, message.id);
  console.log('[engage] dispatch:', result.outcome, 'code' in result ? `(${result.code})` : '');
  if (result.outcome !== 'sent') {
    console.log('  Stopped before or by Meta. Common causes: run with --prepare first; wa_190 the access token expired (a temporary token lasts about a day); wa_132001 the template name or language is not the approved one; wa_132000 the number of --param values differs from the template variables; an error saying the recipient is not allowed means your number is not on the test number\'s recipient list in Meta.');
    await closeEngagePool();
    return;
  }
  console.log('[engage] accepted by Meta. Waiting up to two minutes for delivery reports (Meta -> webhook on the server)...');
  const end = Date.now() + 120_000;
  let last = '';
  while (Date.now() < end) {
    const got = await M.getMessage(a.org, message.id);
    const line = `${got.message.status} [${got.events.map((e) => e.type).join(', ')}]`;
    if (line !== last) { console.log(`  status: ${line}`); last = line; }
    if (['delivered', 'failed'].includes(got.message.status)) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log(last.startsWith('delivered')
    ? '[engage] DELIVERED: sending, the webhook handshake and signature, and the status path all work.'
    : '[engage] No delivery report yet. Is the message on your phone? If yes, the webhook is not reaching the server: check the callback URL, the verify token, the app secret and the subscribed fields in Meta\'s dashboard.');
  await closeEngagePool();
}

main().catch((err) => {
  if (err instanceof ArgError) { console.error(`[engage] ${err.message}`); process.exit(2); }
  console.error('[engage] whatsapp-check failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

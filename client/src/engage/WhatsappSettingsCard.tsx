import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getWhatsappSetup, runWhatsappTemplateCheck, type WhatsappSetup, type WhatsappTemplateInUse } from './settingsApi';
import { ATTENTION_KEY } from './useAttention';
import { CHECK_ERROR_TEXT, META_STATUS_TEXT, SETUP_STEP_TEXT } from './whatsappText';
import { Button, ErrorLine, formatTime } from './ui';

/**
 * The WhatsApp card on Settings (WP-40c, ADR-025): the setup checklist, the webhook URL and fields to give Meta, the template check
 * with "Check now", the account's daily limit of new customers, and the templates that journeys and recent campaigns use with
 * Meta's status. Read-only apart from the check: the account and its secrets are added in a terminal, templates on the Templates tab.
 */

export const WHATSAPP_SETUP_KEY = ['engage', 'whatsapp-setup'] as const;
const STOPPED = new Set(['PAUSED', 'DISABLED', 'REJECTED', 'DELETED', 'PENDING_DELETION', 'ARCHIVED', 'LIMIT_EXCEEDED']);

const statusText = (s: string | null): string => (s === null ? 'Not seen at Meta' : META_STATUS_TEXT[s] ?? s);
const checkErrorText = (code: string): string => CHECK_ERROR_TEXT[code] ?? `The check failed (${code}).`;

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }): JSX.Element {
  return (
    <div data-testid={testId} className="space-y-1 border-t border-app/60 pt-3">
      <h4 className="text-sm font-medium text-app">{title}</h4>
      {children}
    </div>
  );
}

export function WhatsappCard(): JSX.Element {
  const q = useQuery({ queryKey: WHATSAPP_SETUP_KEY, queryFn: getWhatsappSetup, retry: false });
  const title = 'WhatsApp';
  const shell = (body: React.ReactNode) => (
    <section data-testid="settings-whatsapp" className="space-y-3 rounded-md border border-app p-3">
      <h3 className="text-sm font-semibold text-app">{title}</h3>
      {body}
    </section>
  );
  if (q.isLoading) return shell(<p className="text-sm text-app-muted">Loading…</p>);
  if (q.error || !q.data) return shell(<ErrorLine error={q.error ?? new Error('The WhatsApp setup could not be loaded.')} />);
  const v = q.data;
  return shell(
    <>
      <p className="text-xs text-app-muted">
        WhatsApp messages are sent from templates Meta has approved. Messign checks every hour (and when Meta tells it) whether each template
        is still approved, and does not send one that is not. The account and its token are added in a terminal; they are never typed here.
      </p>
      <AccountLine v={v} />
      <Checklist v={v} />
      {v.account && <WebhookSection v={v} />}
      {v.account && <CheckSection v={v} />}
      {v.pacing && <PacingSection pacing={v.pacing} />}
      <TemplatesSection templates={v.templatesInUse} />
      {v.readiness.problems.length > 0 && (
        <Section title="What WhatsApp sending still needs" testId="whatsapp-readiness">
          <ul className="list-disc pl-5 text-sm text-app">
            {v.readiness.problems.map((p) => <li key={p.code}>{p.message}</li>)}
          </ul>
        </Section>
      )}
    </>,
  );
}

function AccountLine({ v }: { v: WhatsappSetup }): JSX.Element {
  if (v.accountProblem === 'whatsapp_account_ambiguous') {
    return <p role="alert" className="text-sm text-red-600" data-testid="whatsapp-account-problem">More than one WhatsApp account is active. Keep exactly one (disable the others under Channel accounts).</p>;
  }
  if (!v.account) return <p className="text-sm text-app" data-testid="whatsapp-account-none">No WhatsApp account is set up yet.</p>;
  const a = v.account;
  return (
    <p className="text-sm text-app" data-testid="whatsapp-account">
      Account {a.label} ({a.provider === 'mock' ? 'development mock' : a.mode === 'live' ? 'live' : 'test'}), phone number id{' '}
      <code className="font-mono">{a.phoneNumberId ?? '—'}</code>, WhatsApp Business Account <code className="font-mono">{a.wabaId ?? 'not set'}</code>
    </p>
  );
}

function Checklist({ v }: { v: WhatsappSetup }): JSX.Element {
  return (
    <ol className="space-y-1 text-sm" data-testid="whatsapp-checklist">
      {v.steps.map(({ step, done }) => {
        const t = SETUP_STEP_TEXT[step] ?? { title: step, todo: '' };
        return (
          <li key={step} data-testid={`whatsapp-step-${step}`} className="flex gap-2">
            <span className={done ? 'text-emerald-700' : 'text-amber-700'} aria-label={done ? 'done' : 'to do'}>{done ? '✓' : '○'}</span>
            <span>
              <span className="font-medium text-app">{t.title}</span>
              {!done && t.todo && <span className="block text-xs text-app-muted">{t.todo}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function WebhookSection({ v }: { v: WhatsappSetup }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const w = v.webhook;
  const copy = async () => {
    if (!w.url) return;
    try { await navigator.clipboard.writeText(w.url); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <Section title="Webhook (Meta App Dashboard > WhatsApp > Configuration)" testId="whatsapp-webhook">
      {w.url ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-app">Callback URL:</span>
          <code className="break-all font-mono text-xs text-app" data-testid="whatsapp-webhook-url">{w.url}</code>
          <Button onClick={() => { void copy(); }} testId="whatsapp-webhook-copy">{copied ? 'Copied' : 'Copy'}</Button>
        </div>
      ) : (
        <p role="alert" className="text-sm text-red-600" data-testid="whatsapp-webhook-missing">
          {w.urlProblem === 'public_api_url_invalid'
            ? 'The server\'s public address (ENGAGE_PUBLIC_API_URL) is not an https URL, so the webhook URL cannot be shown.'
            : 'The server\'s public address (ENGAGE_PUBLIC_API_URL) is not set, so the webhook URL cannot be shown.'} Ask your Messign contact.
        </p>
      )}
      <p className="text-xs text-app-muted">
        The verify token is the one typed when the account was added. Subscribe these fields:{' '}
        {w.fields.map((f, i) => <span key={f}>{i > 0 ? ', ' : ''}<code className="font-mono">{f}</code></span>)}.
        Then subscribe the app to the WhatsApp Business Account (runbook: docs/runbooks/whatsapp.md).
      </p>
      <p className="text-xs text-app-muted" data-testid="whatsapp-webhook-last">
        Last delivery report from Meta: {w.lastDeliveryReportAt ? formatTime(w.lastDeliveryReportAt) : 'none yet'}.
        {' '}Last template update from Meta: {w.lastTemplateUpdateAt ? formatTime(w.lastTemplateUpdateAt) : 'none yet'}.
      </p>
    </Section>
  );
}

function CheckSection({ v }: { v: WhatsappSetup }): JSX.Element {
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: runWhatsappTemplateCheck,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: WHATSAPP_SETUP_KEY });
      void qc.invalidateQueries({ queryKey: ATTENTION_KEY });
      void qc.invalidateQueries({ queryKey: ['engage', 'whatsapp', 'templates'] });
    },
  });
  const c = v.check;
  const failing = c.lastError !== null && c.consecutiveFailures > 0;
  return (
    <Section title="Template check" testId="whatsapp-check">
      <p className="text-sm text-app" data-testid="whatsapp-check-state">
        {c.lastAttemptAt === null
          ? 'The template check has not run yet.'
          : `Last successful check: ${c.lastOkAt ? formatTime(c.lastOkAt) : 'never'}; ${c.templatesSeen} template${c.templatesSeen === 1 ? '' : 's'} at Meta.`}
      </p>
      {failing && (
        <p role="alert" className="text-sm text-red-600" data-testid="whatsapp-check-error">
          The last {c.consecutiveFailures === 1 ? 'check' : `${c.consecutiveFailures} checks`} failed: {checkErrorText(c.lastError!)}
        </p>
      )}
      <p className="text-xs text-app-muted">
        The check reads your templates from Meta with the account's token, so it also shows whether the token still works. It sends nothing.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => run.mutate()} disabled={run.isPending} testId="whatsapp-check-now">{run.isPending ? 'Checking…' : 'Check now'}</Button>
        {run.data && (run.data.ok
          ? <span role="status" className="text-sm text-emerald-700" data-testid="whatsapp-check-result">Done: {run.data.seen} templates read, {run.data.changed} changed.</span>
          : <span role="alert" className="text-sm text-red-600" data-testid="whatsapp-check-result">{checkErrorText(run.data.error ?? 'check_failed')}</span>)}
      </div>
      <ErrorLine error={run.error} />
    </Section>
  );
}

function PacingSection({ pacing: p }: { pacing: NonNullable<WhatsappSetup['pacing']> }): JSX.Element {
  return (
    <Section title="Daily limit of new customers" testId="whatsapp-pacing">
      <p className="text-sm text-app" data-testid="whatsapp-pacing-state">
        {p.contacted24h.toLocaleString('en-US')} of {p.limit.toLocaleString('en-US')} customers messaged in the last 24 hours
        {p.limitIsDefault ? ' (Meta\'s starting limit; the account does not say its own yet)' : ''}.
        {p.waiting > 0 ? ` ${p.waiting} message${p.waiting === 1 ? ' is' : 's are'} waiting for room${p.waitingOverADay > 0 ? `, ${p.waitingOverADay} for over a day` : ''}.` : ''}
      </p>
      <p className="text-xs text-app-muted">
        Meta limits how many different customers a business can message in 24 hours (250 at the start, then 2,000, 10,000, 100,000). Messign keeps
        under the limit by holding the rest until there is room. When WhatsApp Manager shows a higher limit, rotate the account with
        <code className="font-mono"> --config daily_recipient_limit=&lt;n&gt;</code>.
      </p>
    </Section>
  );
}

function TemplatesSection({ templates }: { templates: WhatsappTemplateInUse[] }): JSX.Element {
  return (
    <Section title="Templates in use" testId="whatsapp-templates">
      {templates.length === 0 ? (
        <p className="text-sm text-app-muted" data-testid="whatsapp-templates-none">
          No active journey or recent campaign sends a WhatsApp template. Register one on the Templates tab (New template, channel WhatsApp).
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {templates.map((t) => {
            const bad = (t.status !== null && STOPPED.has(t.status)) || t.quality === 'RED';
            const pending = !bad && t.status !== 'APPROVED';
            return (
              <li key={`${t.metaName}|${t.language}`} data-testid={`whatsapp-template-${t.metaName}-${t.language}`} className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-app">{t.metaName}</code>
                <span className="text-xs text-app-muted">{t.language}</span>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${bad ? 'bg-red-500/15 text-red-600' : pending ? 'bg-amber-500/15 text-amber-700' : 'bg-emerald-500/15 text-emerald-700'}`}>
                  {statusText(t.status)}{t.quality === 'RED' ? ', quality red' : t.quality === 'YELLOW' ? ', quality yellow' : ''}
                </span>
                <span className="text-xs text-app-muted">
                  {t.journeyKeys.length ? `used by ${t.journeyKeys.join(', ')}` : ''}{t.journeyKeys.length && t.recentMessages ? '; ' : ''}
                  {t.recentMessages ? `${t.recentMessages} message${t.recentMessages === 1 ? '' : 's'} in 7 days` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {templates.some((t) => (t.status !== null && STOPPED.has(t.status)) || t.quality === 'RED') && (
        <p className="text-xs text-app-muted">
          A paused, disabled or rejected template is not sent: the gate refuses its messages. Fix or replace it in WhatsApp Manager; Messign sees the change
          within the hour, or at once when Meta's template update reaches the webhook.
        </p>
      )}
    </Section>
  );
}

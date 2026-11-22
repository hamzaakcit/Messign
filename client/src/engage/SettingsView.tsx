import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addRateCard, checkEmailDomain, checkIys, disableChannelAccount, getDeliveryHealth, getEmailDomain, getIys, getSettings, issuesOf, problemsOf, recordReadinessItem,
  setBudgetCap, setSendEnabled, setSenderName, updateGateSettings, type Channel, type EmailDomainCheck, type IysView, type TenantSettings,
} from './settingsApi';
import { attentionText } from './attentionText';
import { ATTENTION_KEY, useAttention } from './useAttention';
import { dkimText, dmarcText, spfText } from './emailDomainText';
import { Button, ErrorLine, Field, Select, StatusBadge, TextInput, formatTime } from './ui';

/**
 * Engage settings (WP-22) for tenant admins: whether sending is on, the readiness it needs, quiet hours and the
 * frequency cap, the monthly budget caps and rates, and the channel accounts. Every change goes to the server, which
 * owns the rules (send_enabled is refused until readiness is complete). Account secrets are never entered here.
 */

const KEY = ['engage', 'settings'] as const;
const CHANNELS: Channel[] = ['email', 'sms', 'whatsapp'];
const CHANNEL_OPTIONS = CHANNELS.map((c) => ({ value: c, label: c }));
const CATEGORY_OPTIONS = [
  { value: 'marketing' as const, label: 'marketing' },
  { value: 'transactional' as const, label: 'transactional' },
];
const MONEY = /^\d+(\.\d{1,2})?$/;

const money = (minor: number, currency: string): string =>
  `${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

/** A save that replaces the whole settings view on success and shows the server's reasons on refusal. */
function useSettingsSave<A>(run: (input: A) => Promise<TenantSettings>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: run, onSuccess: (s) => { qc.setQueryData(KEY, s); } });
}

function Card({ title, children, testId }: { title: string; children: ReactNode; testId: string }): JSX.Element {
  return (
    <section data-testid={testId} className="space-y-3 rounded-md border border-app p-3">
      <h3 className="text-sm font-semibold text-app">{title}</h3>
      {children}
    </section>
  );
}

/** Refusals carry the reasons (409 problems, 400 issues); show them under the form instead of a bare message. */
function SaveErrors({ error }: { error: unknown }): JSX.Element | null {
  if (!error) return null;
  const problems = problemsOf(error);
  const issues = issuesOf(error);
  return (
    <div className="space-y-1" data-testid="settings-error">
      <ErrorLine error={error} />
      {problems.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-app" data-testid="settings-problems">
          {problems.map((p) => <li key={p.code}>{p.message}</li>)}
        </ul>
      )}
      {issues.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-app">
          {issues.map((i) => <li key={i}><code className="text-xs text-app-muted">{i}</code></li>)}
        </ul>
      )}
    </div>
  );
}

export function SettingsSection(): JSX.Element {
  const q = useQuery({ queryKey: KEY, queryFn: getSettings });
  if (q.isLoading) return <p className="mt-6 text-sm text-app-muted">Loading settings…</p>;
  if (q.error || !q.data) return <ErrorLine error={q.error ?? new Error('Settings could not be loaded.')} />;
  const s = q.data;
  return (
    <div data-testid="hub-settings" className="space-y-4">
      <AttentionCard />
      <SendingCard s={s} />
      <SenderCard s={s} />
      <ReadinessCard s={s} />
      <EmailDomainCard />
      <IysCard />
      <GateCard s={s} />
      <CapsCard s={s} />
      <AccountsCard s={s} />
      <DeliveryHealthCard />
    </div>
  );
}

function SendingCard({ s }: { s: TenantSettings }): JSX.Element {
  const save = useSettingsSave((enabled: boolean) => setSendEnabled(enabled));
  const ready = s.readiness.ready;
  return (
    <Card title="Sending" testId="settings-sending">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={s.sendEnabled ? 'active' : 'draft'} />
        <span className="text-app" data-testid="settings-send-state">{s.sendEnabled ? 'Sending is on for this organization.' : 'Sending is off for this organization.'}</span>
        <span className="text-xs text-app-muted">Server mode: {s.readiness.sendMode}</span>
      </div>
      {!ready && (
        <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-sm text-app">
          <p className="font-medium">Sending cannot be turned on yet:</p>
          <ul className="list-disc pl-5">
            {s.readiness.problems.map((p) => <li key={p.code}>{p.message}</li>)}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {s.sendEnabled ? (
          <Button kind="danger" onClick={() => save.mutate(false)} disabled={save.isPending} testId="settings-send-off">Turn sending off</Button>
        ) : (
          <Button kind="primary" onClick={() => save.mutate(true)} disabled={!ready || save.isPending} testId="settings-send-on">Turn sending on</Button>
        )}
        <p className="text-xs text-app-muted">
          Turning sending on checks readiness first. While anything is missing the request is refused and sending stays off.
          Every message still passes the send gate and the customer's consent.
        </p>
      </div>
      <SaveErrors error={save.error} />
    </Card>
  );
}

/**
 * The sender name: the name customers know the shop by. A template or a copy draft refers to it as {{sender_name}}; the
 * name is filled in when a message is made, and never written by the AI model. Until it is set, such a message is refused.
 */
function SenderCard({ s }: { s: TenantSettings }): JSX.Element {
  const [name, setName] = useState(s.senderName ?? '');
  const save = useSettingsSave(() => setSenderName(name.trim() === '' ? null : name.trim()));
  return (
    <Card title="Sender name" testId="settings-sender">
      <p className="text-xs text-app-muted">
        The name your customers know the shop by. Templates use <code className="font-mono">{'{{sender_name}}'}</code> for a sign-off; the name is filled in when a message is made.
        One line, up to 80 characters, no angle brackets or braces.
      </p>
      {!s.senderName && (
        <p role="alert" className="text-sm text-red-600" data-testid="sender-not-set">
          Not set. A message that uses the sender name will not be sent until you set it.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sender name">
          <TextInput value={name} onChange={setName} ariaLabel="Sender name" testId="sender-name" placeholder="Your shop name" />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Button kind="primary" onClick={() => save.mutate(undefined)} disabled={save.isPending} testId="sender-save">Save</Button>
        {save.isSuccess && <span className="text-xs text-app-muted">Saved.</span>}
      </div>
      <SaveErrors error={save.error} />
    </Card>
  );
}

function ReadinessCard({ s }: { s: TenantSettings }): JSX.Element {
  return (
    <Card title="Readiness" testId="settings-readiness">
      <p className="text-xs text-app-muted">
        What you record here is what your team states, with an optional link to the evidence. Messign does not verify it,
        except the email domain item, which is set by the DNS check below. Live email sending needs the items marked for email.
      </p>
      <div className="space-y-3">
        {CHANNELS.flatMap((channel) => s.requiredItems[channel].map((item) => (
          channel === 'email' && item === EMAIL_DOMAIN_ITEM ? (
            <DomainItemRow key={`${channel}.${item}`} recorded={s.readinessItems.find((r) => r.channel === channel && r.item === item) ?? null} />
          ) : (
          <ReadinessRow
            key={`${channel}.${item}`}
            channel={channel}
            item={item}
            recorded={s.readinessItems.find((r) => r.channel === channel && r.item === item) ?? null}
          />
          )
        )))}
      </div>
    </Card>
  );
}

const EMAIL_DOMAIN_ITEM = 'email_domain_authenticated';

/** The domain item is not typed in: it follows the last DNS check (see the card below). */
function DomainItemRow({ recorded }: { recorded: TenantSettings['readinessItems'][number] | null }): JSX.Element {
  return (
    <div className="rounded-md border border-app/60 p-2" data-testid={`readiness-email-${EMAIL_DOMAIN_ITEM}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-app">email · {EMAIL_DOMAIN_ITEM}</span>
        <span className={recorded ? 'text-xs text-emerald-700' : 'text-xs text-app-muted'}>
          {recorded ? `Checked ${formatTime(recorded.recordedAt)}` : 'Not checked, or the last check failed'}
        </span>
      </div>
      <p className="mt-1 text-xs text-app-muted">Set by the email domain check below. It cannot be typed in. Messign looks again about once a day and renews or removes it; a check older than 30 days no longer counts for live sending.</p>
    </div>
  );
}

/**
 * The email domain check (WP-39): looks up SPF, DKIM and DMARC for the domain of the active email account's From address.
 * It reads DNS only. A pass sets the readiness item above; a failure removes it. DKIM selectors are the names your email
 * provider shows when it asks you to publish its DKIM records.
 */
function EmailDomainCard(): JSX.Element {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: DOMAIN_KEY, queryFn: getEmailDomain });
  const [selectors, setSelectors] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: (list: string[] | null) => checkEmailDomain(list),
    onSuccess: (view) => { qc.setQueryData(DOMAIN_KEY, view); void qc.invalidateQueries({ queryKey: KEY }); },
  });
  if (q.isLoading) return <Card title="Email domain" testId="settings-email-domain"><p className="text-sm text-app-muted">Loading…</p></Card>;
  if (q.error || !q.data) return <Card title="Email domain" testId="settings-email-domain"><ErrorLine error={q.error ?? new Error('The email domain could not be loaded.')} /></Card>;
  const v = q.data;
  const last = v.lastCheck;
  const shown = selectors ?? (last?.dkimSelectors ?? []).join(', ');
  const parsed = shown.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  const problem = v.accountProblem === 'no_email_account' ? 'No email sending account is set up yet.'
    : v.accountProblem === 'email_account_ambiguous' ? 'More than one email account is active. Keep exactly one.'
      : v.account && !v.account.domain ? 'The email account\'s From address has no usable domain.' : null;
  return (
    <Card title="Email domain" testId="settings-email-domain">
      <p className="text-xs text-app-muted">
        Checks, in DNS, that the domain you send email from has an SPF record, the DKIM records you name, and a DMARC record. It sends nothing.
        Live email sending needs a passing check.
      </p>
      {problem ? (
        <p role="alert" className="text-sm text-red-600" data-testid="email-domain-problem">{problem}</p>
      ) : (
        <p className="text-sm text-app" data-testid="email-domain-account">Sending domain: <code className="font-mono">{v.account?.domain}</code> (account {v.account?.label})</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="DKIM selectors" hint="up to 5, separated by commas, as your email provider shows them (for example s1, s2)">
          <TextInput value={shown} onChange={setSelectors} ariaLabel="DKIM selectors" testId="email-domain-selectors" placeholder="s1, s2, s3" />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Button kind="primary" onClick={() => run.mutate(selectors === null ? null : parsed)} disabled={!!problem || run.isPending} testId="email-domain-check">
          {run.isPending ? 'Checking…' : 'Check now'}
        </Button>
      </div>
      <SaveErrors error={run.error} />
      {last && <DomainResult check={last} />}
    </Card>
  );
}

const DOMAIN_KEY = ['engage', 'email-domain'] as const;

function DomainResult({ check }: { check: EmailDomainCheck }): JSX.Element {
  const row = (label: string, ok: boolean, text: string, testId: string) => (
    <li key={testId} data-testid={testId} className="flex gap-2">
      <span className={ok ? 'text-emerald-700' : 'text-red-600'} aria-label={ok ? 'found' : 'not found'}>{ok ? '✓' : '✗'}</span>
      <span><span className="font-medium text-app">{label}</span> <span className="text-app-muted">{text}</span></span>
    </li>
  );
  return (
    <div className="space-y-1 text-sm" data-testid="email-domain-result">
      <p className={check.passed ? 'font-medium text-emerald-700' : 'font-medium text-red-600'} data-testid="email-domain-verdict">
        {check.passed ? 'Passed' : 'Did not pass'} for <code className="font-mono">{check.domain}</code>, checked {check.automatic ? 'automatically ' : ''}{formatTime(check.checkedAt)}.
      </p>
      <ul className="space-y-1">
        {row('SPF', check.spf.ok, spfText(check.spf.code), 'email-domain-spf')}
        {check.dkim.length === 0
          ? row('DKIM', false, dkimText('dkim_selectors_not_set', ''), 'email-domain-dkim-none')
          : check.dkim.map((d) => row(`DKIM ${d.selector}`, d.ok, dkimText(d.code, d.selector), `email-domain-dkim-${d.selector}`))}
        {row('DMARC', check.dmarc.ok, dmarcText(check.dmarc.code, check.dmarc.policy), 'email-domain-dmarc')}
      </ul>
    </div>
  );
}

function ReadinessRow({ channel, item, recorded }: {
  channel: Channel; item: string; recorded: TenantSettings['readinessItems'][number] | null;
}): JSX.Element {
  const [value, setValue] = useState(recorded?.value ?? '');
  const [evidence, setEvidence] = useState(recorded?.evidenceUrl ?? '');
  const save = useSettingsSave(() => recordReadinessItem(channel, item, value.trim(), evidence.trim() || null));
  return (
    <div className="rounded-md border border-app/60 p-2" data-testid={`readiness-${channel}-${item}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-app">{channel} · {item}</span>
        <span className={recorded ? 'text-xs text-emerald-700' : 'text-xs text-app-muted'}>
          {recorded ? `Recorded ${formatTime(recorded.recordedAt)}` : 'Not recorded'}
        </span>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Field label="Value" hint="e.g. the date, or the reference">
          <TextInput value={value} onChange={setValue} ariaLabel={`${item} value`} testId={`readiness-value-${channel}-${item}`} />
        </Field>
        <Field label="Evidence link" hint="optional, https">
          <TextInput value={evidence} onChange={setEvidence} ariaLabel={`${item} evidence link`} testId={`readiness-evidence-${channel}-${item}`} />
        </Field>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Button onClick={() => save.mutate(undefined)} disabled={value.trim() === '' || save.isPending} testId={`readiness-save-${channel}-${item}`}>Save</Button>
        {save.isSuccess && <span className="text-xs text-app-muted">Saved.</span>}
      </div>
      <SaveErrors error={save.error} />
    </div>
  );
}

function GateCard({ s }: { s: TenantSettings }): JSX.Element {
  const [timezone, setTimezone] = useState(s.timezone);
  const [qStart, setQStart] = useState(s.quietHours?.start ?? '');
  const [qEnd, setQEnd] = useState(s.quietHours?.end ?? '');
  const [max, setMax] = useState(String(s.frequencyCap.max));
  const [windowHours, setWindowHours] = useState(String(s.frequencyCap.windowHours));
  const [localIssue, setLocalIssue] = useState<string | null>(null);
  const save = useSettingsSave(() => {
    const quietHours = qStart && qEnd ? { start: qStart, end: qEnd } : null;
    return updateGateSettings({ timezone: timezone.trim(), quietHours, frequencyCap: { max: Number(max), windowHours: Number(windowHours) } });
  });
  const submit = () => {
    if ((qStart === '') !== (qEnd === '')) { setLocalIssue('Set both quiet hour times, or clear both.'); return; }
    setLocalIssue(null);
    save.mutate(undefined);
  };
  return (
    <Card title="Quiet hours and frequency cap" testId="settings-gate">
      <p className="text-xs text-app-muted">
        Marketing emails that fall in quiet hours wait until they end. The frequency cap limits how many marketing emails one customer
        gets on a channel in the window. Both apply to marketing only.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Time zone" hint="IANA name, e.g. Europe/Istanbul">
          <TextInput value={timezone} onChange={setTimezone} ariaLabel="Time zone" testId="gate-timezone" mono />
        </Field>
        <div />
        <Field label="Quiet hours start" hint="HH:MM">
          <TextInput value={qStart} onChange={setQStart} ariaLabel="Quiet hours start" testId="gate-quiet-start" mono />
        </Field>
        <Field label="Quiet hours end" hint="HH:MM, may be earlier than start">
          <TextInput value={qEnd} onChange={setQEnd} ariaLabel="Quiet hours end" testId="gate-quiet-end" mono />
        </Field>
        <Field label="Frequency cap" hint="messages per customer">
          <TextInput value={max} onChange={setMax} ariaLabel="Frequency cap" testId="gate-frequency-max" mono />
        </Field>
        <Field label="Frequency window" hint="hours">
          <TextInput value={windowHours} onChange={setWindowHours} ariaLabel="Frequency window hours" testId="gate-frequency-window" mono />
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <Button kind="primary" onClick={submit} disabled={save.isPending} testId="gate-save">Save</Button>
        {save.isSuccess && <span className="text-xs text-app-muted">Saved.</span>}
      </div>
      {localIssue && <p role="alert" className="text-sm text-red-600">{localIssue}</p>}
      <SaveErrors error={save.error} />
    </Card>
  );
}

function CapsCard({ s }: { s: TenantSettings }): JSX.Element {
  const [channel, setChannel] = useState<Channel>('email');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('TRY');
  const [localIssue, setLocalIssue] = useState<string | null>(null);
  const capSave = useSettingsSave(() => setBudgetCap(channel, Math.round(Number(amount) * 100), currency.trim().toUpperCase()));

  const [rChannel, setRChannel] = useState<Channel>('email');
  const [category, setCategory] = useState<'marketing' | 'transactional'>('marketing');
  const [unit, setUnit] = useState('');
  const [rCurrency, setRCurrency] = useState('TRY');
  const rateSave = useSettingsSave(() => addRateCard({
    channel: rChannel, category, unitCostMinor: Math.round(Number(unit) * 100), currency: rCurrency.trim().toUpperCase(),
  }));

  const submitCap = () => {
    if (!MONEY.test(amount.trim())) { setLocalIssue('The monthly cap is an amount such as 5000 or 5000.50.'); return; }
    setLocalIssue(null);
    capSave.mutate(undefined);
  };
  const submitRate = () => {
    if (!MONEY.test(unit.trim())) { setLocalIssue('The unit cost is an amount such as 0.12.'); return; }
    setLocalIssue(null);
    rateSave.mutate(undefined);
  };

  return (
    <Card title="Budget caps and rates" testId="settings-caps">
      <p className="text-xs text-app-muted">
        A message is only sent while its channel's monthly cap has room. The cost of each message comes from the rate in effect when
        it is allowed; a new rate is added as a new row, so earlier messages keep the cost they were given.
      </p>
      <div className="space-y-1 text-sm" data-testid="settings-budget-list">
        {s.budgetCaps.length === 0 && <p className="text-app-muted">No monthly cap is set yet.</p>}
        {s.budgetCaps.map((c) => (
          <p key={c.channel} className="text-app">{c.channel}: {money(c.monthlyCapMinor, c.currency)} per month</p>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Channel"><Select value={channel} onChange={setChannel} options={CHANNEL_OPTIONS} ariaLabel="Cap channel" testId="cap-channel" /></Field>
        <Field label="Monthly cap"><TextInput value={amount} onChange={setAmount} ariaLabel="Monthly cap" testId="cap-amount" mono /></Field>
        <Field label="Currency"><TextInput value={currency} onChange={setCurrency} ariaLabel="Cap currency" testId="cap-currency" mono /></Field>
        <div className="flex items-end"><Button kind="primary" onClick={submitCap} disabled={amount.trim() === '' || capSave.isPending} testId="cap-save">Save cap</Button></div>
      </div>
      {capSave.isSuccess && <p className="text-xs text-app-muted">Cap saved.</p>}
      <SaveErrors error={capSave.error} />

      <div className="space-y-1 border-t border-app/60 pt-3 text-sm" data-testid="settings-rate-list">
        {s.rateCards.length === 0 && <p className="text-app-muted">No rate is set yet. Messages are not allowed without one.</p>}
        {s.rateCards.map((r) => (
          <p key={`${r.channel}.${r.category}.${r.route}`} className="text-app">
            {r.channel} {r.category} ({r.route}): {money(r.unitCostMinor, r.currency)} per message, from {formatTime(r.effectiveFrom)}
          </p>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-5">
        <Field label="Channel"><Select value={rChannel} onChange={setRChannel} options={CHANNEL_OPTIONS} ariaLabel="Rate channel" testId="rate-channel" /></Field>
        <Field label="Category"><Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} ariaLabel="Rate category" testId="rate-category" /></Field>
        <Field label="Cost per message"><TextInput value={unit} onChange={setUnit} ariaLabel="Cost per message" testId="rate-unit" mono /></Field>
        <Field label="Currency"><TextInput value={rCurrency} onChange={setRCurrency} ariaLabel="Rate currency" testId="rate-currency" mono /></Field>
        <div className="flex items-end"><Button onClick={submitRate} disabled={unit.trim() === '' || rateSave.isPending} testId="rate-save">Add rate</Button></div>
      </div>
      {rateSave.isSuccess && <p className="text-xs text-app-muted">Rate added.</p>}
      <SaveErrors error={rateSave.error} />
      {localIssue && <p role="alert" className="text-sm text-red-600">{localIssue}</p>}
    </Card>
  );
}

function AccountsCard({ s }: { s: TenantSettings }): JSX.Element {
  const qc = useQueryClient();
  const disable = useMutation({
    mutationFn: (id: string) => disableChannelAccount(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  return (
    <Card title="Channel accounts" testId="settings-accounts">
      <p className="text-xs text-app-muted">
        Accounts are added in a terminal with <code>npm run engage:add-account</code>, which asks for the provider secret at a hidden
        prompt. Secrets are never entered or shown here. Disabling an account stops messages going through it.
      </p>
      {s.channelAccounts.length === 0 && <p className="text-sm text-app-muted">No channel account yet. Sending needs exactly one active email account.</p>}
      <div className="space-y-2">
        {s.channelAccounts.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-md border border-app/60 p-2 text-sm" data-testid={`account-${a.id}`}>
            <span className="font-medium text-app">{a.label}</span>
            <span className="text-xs text-app-muted">{a.channel} · {a.provider} · {a.mode} mode{a.hint ? ` · ${a.hint}` : ''}</span>
            <StatusBadge status={a.status} />
            <span className="text-xs text-app-muted">added {formatTime(a.createdAt)}</span>
            {a.status === 'active' && (
              <Button
                kind="danger"
                disabled={disable.isPending}
                testId={`account-disable-${a.id}`}
                onClick={() => {
                  if (window.confirm(`Disable the account "${a.label}"? Messages will not be sent through it.`)) disable.mutate(a.id);
                }}
              >
                Disable
              </Button>
            )}
          </div>
        ))}
      </div>
      <ErrorLine error={disable.error} />
    </Card>
  );
}

/** What needs the admin's attention, first on the screen. Shown only when there is something; an item goes when its cause does. */
function AttentionCard(): JSX.Element | null {
  const items = useAttention(true).data ?? [];
  if (items.length === 0) return null;
  return (
    <section data-testid="settings-attention" role="alert" className="space-y-2 rounded-md border border-red-500/40 bg-red-500/5 p-3">
      <h3 className="text-sm font-semibold text-app">Needs attention</h3>
      <ul className="space-y-2">
        {items.map((item) => {
          const t = attentionText(item);
          return (
            <li key={`${item.code}:${item.subject ?? ''}`} data-testid={`attention-${item.code}`} className="text-sm">
              <p className={item.severity === 'critical' ? 'font-medium text-red-600' : 'font-medium text-amber-700'}>{t.title}</p>
              <p className="text-app-muted">{t.detail}</p>
              {item.since && <p className="text-xs text-app-muted">Since {formatTime(item.since)}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const HEALTH_KEY = ['engage', 'delivery-health'] as const;
const ACCOUNT_STATUS: Record<string, { text: string; style: string }> = {
  ok: { text: 'Delivering normally', style: 'bg-emerald-500/15 text-emerald-700' },
  degraded: { text: 'Needs a look', style: 'bg-amber-500/15 text-amber-700' },
  failing: { text: 'Needs action', style: 'bg-red-500/15 text-red-600' },
};

/** How each channel account is delivering now: the provider calls of the last 15 minutes, and bounces and delivery reports of the last day (WP-29). */
function DeliveryHealthCard(): JSX.Element | null {
  const q = useQuery({ queryKey: HEALTH_KEY, queryFn: getDeliveryHealth, staleTime: 60_000, retry: false });
  const title = 'Delivery health';
  if (q.isLoading) return <Card title={title} testId="settings-delivery"><p className="text-sm text-app-muted">Loading…</p></Card>;
  if (q.error || !q.data) return <Card title={title} testId="settings-delivery"><ErrorLine error={q.error ?? new Error('Delivery health could not be loaded.')} /></Card>;
  const h = q.data;
  return (
    <Card title={title} testId="settings-delivery">
      <p className="text-xs text-app-muted">
        What the channel accounts did recently: messages handed to the provider, bounces, and delivery reports coming back. Problems found here are also listed under "Needs attention" and sent to your Messign contact.
      </p>
      {h.accounts.length === 0 && <p className="text-sm text-app-muted" data-testid="delivery-none">There is no active channel account yet.</p>}
      <ul className="space-y-2">
        {h.accounts.map((a) => (
          <li key={a.accountId} data-testid={`delivery-${a.accountId}`} className="text-sm text-app">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{a.label}</span>
              <span className="text-xs text-app-muted">{a.channel} · {a.provider} · {a.mode}</span>
              <span data-testid={`delivery-status-${a.accountId}`} className={`rounded px-1.5 py-0.5 text-xs font-medium ${ACCOUNT_STATUS[a.status]!.style}`}>{ACCOUNT_STATUS[a.status]!.text}</span>
            </div>
            <p className="text-xs text-app-muted">
              Last 15 minutes: {a.last15m.sent} handed over, {a.last15m.failed + a.last15m.retried} failed or retried.
              {' '}Last 24 hours: {a.last24h.sent} sent, {a.last24h.reports} reports back, {a.last24h.bounced} bounced{a.channel === 'email' ? `, ${a.last24h.complained} complaints` : ''}.
              {a.waitingForReport > 0 ? ` ${a.waitingForReport} accepted messages are still waiting for a delivery report.` : ''}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const IYS_KEY = ['engage', 'iys'] as const;
const HEALTH_STYLE: Record<string, string> = { ok: 'bg-emerald-500/15 text-emerald-700', warning: 'bg-amber-500/15 text-amber-700', critical: 'bg-red-500/15 text-red-600' };
const PULL_TEXT: Record<string, string> = { ok: 'Up to date', stale: 'Behind', critical: 'Not working for days', never: 'Has not run yet' };

function IysCard(): JSX.Element {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: IYS_KEY, queryFn: getIys });
  const check = useMutation({ mutationFn: checkIys, onSuccess: () => { void qc.invalidateQueries({ queryKey: IYS_KEY }); void qc.invalidateQueries({ queryKey: ATTENTION_KEY }); } });
  const title = 'İYS (consent register)';
  if (q.isLoading) return <Card title={title} testId="settings-iys"><p className="text-sm text-app-muted">Loading…</p></Card>;
  if (q.error || !q.data) return <Card title={title} testId="settings-iys"><ErrorLine error={q.error ?? new Error('The İYS connection could not be loaded.')} /></Card>;
  const v: IysView = q.data;
  const intro = (
    <p className="text-xs text-app-muted">
      İYS is Turkey's register of consent for commercial messages. Messign reports your customers' opt-outs to İYS and applies what customers do in İYS
      (a revocation stops marketing to them before the next send), using your own İYS account.
    </p>
  );
  if (!v.connection || !v.report) {
    return (
      <Card title={title} testId="settings-iys">
        {intro}
        <p className="text-sm text-app" data-testid="iys-not-connected">
          No İYS account is connected. Your İYS access (the API user name and password İYS gave you) is added by your Messign contact; it is never typed in this browser.
        </p>
      </Card>
    );
  }
  const { connection: c, report: r } = v;
  const result = check.data;
  return (
    <Card title={title} testId="settings-iys">
      {intro}
      <div className="flex flex-wrap items-center gap-2 text-sm text-app">
        <span data-testid="iys-account">Account: {c.provider === 'mock' ? 'development mock' : c.mode === 'live' ? 'live' : 'İYS sandbox'}, İYS no. <code className="font-mono">{c.iysCode ?? '—'}</code>, brand no. <code className="font-mono">{c.brandCode ?? '—'}</code></span>
        <span data-testid="iys-health" className={`rounded px-1.5 py-0.5 text-xs font-medium ${HEALTH_STYLE[r.health]}`}>{r.health === 'ok' ? 'All good' : r.health === 'warning' ? 'Needs a look' : 'Needs action'}</span>
      </div>
      <ul className="space-y-1 text-sm text-app">
        <li data-testid="iys-push">
          Opt-outs waiting to be reported to İYS: <strong>{r.push.pending}</strong>
          {r.push.late + r.push.atRisk + r.push.breached > 0 && (
            <span className="text-app-muted"> (over a day: {r.push.late}, near the three-business-day limit: {r.push.atRisk}, past it: {r.push.breached})</span>
          )}
          <span className="text-app-muted">. Reported: {r.push.sent}, nothing to report: {r.push.skipped}, refused: {r.push.failed}.</span>
        </li>
        <li data-testid="iys-pull">
          Customers' changes in İYS: <strong>{PULL_TEXT[r.pull.status]}</strong>
          <span className="text-app-muted">. Last successful pull: {formatTime(r.pull.lastPullAt)}{r.pull.lastErrorCode && r.pull.status !== 'ok' ? `. Last answer: ${r.pull.lastErrorCode}` : ''}.</span>
        </li>
      </ul>
      <div className="flex items-center gap-2">
        <Button onClick={() => check.mutate()} disabled={check.isPending} testId="iys-check">{check.isPending ? 'Checking…' : 'Check connection'}</Button>
        {result && (result.ok
          ? <span role="status" data-testid="iys-check-result" className="text-sm text-emerald-700">The connection works.</span>
          : <span role="alert" data-testid="iys-check-result" className="text-sm text-red-600">{result.code ? `${result.code}: ` : ''}{result.message ?? 'The check did not pass.'}</span>)}
      </div>
      <SaveErrors error={check.error} />
    </Card>
  );
}

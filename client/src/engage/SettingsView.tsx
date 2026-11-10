import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addRateCard, disableChannelAccount, getSettings, issuesOf, problemsOf, recordReadinessItem, setBudgetCap, setSendEnabled,
  updateGateSettings, type Channel, type TenantSettings,
} from './settingsApi';
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
      <SendingCard s={s} />
      <ReadinessCard s={s} />
      <GateCard s={s} />
      <CapsCard s={s} />
      <AccountsCard s={s} />
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

function ReadinessCard({ s }: { s: TenantSettings }): JSX.Element {
  return (
    <Card title="Readiness" testId="settings-readiness">
      <p className="text-xs text-app-muted">
        What you record here is what your team states, with an optional link to the evidence. Messign does not verify it.
        Live email sending needs the items marked for email.
      </p>
      <div className="space-y-3">
        {CHANNELS.flatMap((channel) => s.requiredItems[channel].map((item) => (
          <ReadinessRow
            key={`${channel}.${item}`}
            channel={channel}
            item={item}
            recorded={s.readinessItems.find((r) => r.channel === channel && r.item === item) ?? null}
          />
        )))}
      </div>
    </Card>
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

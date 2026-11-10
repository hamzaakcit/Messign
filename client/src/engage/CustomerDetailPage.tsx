import { useQuery } from '@tanstack/react-query';
import { getCustomerTrail, type CustomerTrail, type TrailDecision, type TrailMessage } from './customersApi';
import { formatTime } from './CustomersPage';

/**
 * One customer's audit trail (WP-19): every message with its delivery events and every send-gate decision, each
 * decision with the consent record that was in force when it was taken; journeys step by step; consent history,
 * suppressions, addresses and recent events. Read only.
 */

const DECISION_TEXT: Record<string, string> = {
  allowed: 'allowed',
  no_consent: 'no marketing consent',
  suppressed: 'address suppressed',
  not_allowlisted: 'not on the sandbox allow-list',
  quiet_hours: 'quiet hours (sent later)',
  frequency_cap: 'frequency cap reached',
  budget_exceeded: 'monthly budget reached',
  expired: 'too old to send',
  no_recipient: 'no address for this channel',
  readiness_missing: 'legal setup incomplete',
  account_mode_mismatch: 'account mode does not match the send mode',
  account_inactive: 'sending account disabled',
  no_rate_card: 'no price set for this channel',
  no_budget_cap: 'no monthly budget set',
  currency_mismatch: 'price and budget currencies differ',
  gate_error: 'checks could not run (not sent)',
};
export const decisionText = (code: string): string =>
  DECISION_TEXT[code] ?? (code.startsWith('render_') ? `template could not be filled (${code.slice(7)})` : code.replace(/_/g, ' '));

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }): JSX.Element {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-app-muted">{title}{count !== undefined ? ` (${count})` : ''}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
const Empty = ({ text }: { text: string }) => <p className="text-sm text-app-muted">{text}</p>;

function Decision({ d }: { d: TrailDecision }): JSX.Element {
  const colour = d.decision === 'allow' ? 'text-emerald-700' : d.decision === 'defer' ? 'text-amber-700' : 'text-red-600';
  const others = d.reasons.map((r) => r.code).filter((c): c is string => Boolean(c) && c !== d.code);
  return (
    <li className="rounded border border-app px-3 py-2 text-sm" data-testid="gate-decision">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={`font-semibold ${colour}`}>{d.decision}</span>
        <span className="text-app">{decisionText(d.code)}</span>
        <span className="text-xs text-app-muted">{formatTime(d.createdAt)} · {d.sendMode}</span>
      </div>
      {others.length > 0 && <p className="mt-1 text-xs text-app-muted">Also: {others.map(decisionText).join(', ')}</p>}
      <p className="mt-1 text-xs text-app-muted" data-testid="consent-in-force">
        {d.consentInForce
          ? `Consent in force: ${d.consentInForce.status} (${d.consentInForce.source.replace(/_/g, ' ')}, recorded ${formatTime(d.consentInForce.recordedAt)})`
          : 'Consent in force: none recorded at that time'}
      </p>
    </li>
  );
}

function Message({ m }: { m: TrailMessage }): JSX.Element {
  return (
    <li className="rounded-md border border-app p-3" data-testid="trail-message">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-app">{m.subject ?? (m.renderError ? 'Template could not be filled' : '(no subject)')}</span>
        <span className="text-xs text-app-muted">{m.channel} · {m.purpose} · <strong className="text-app">{m.status}</strong> · {formatTime(m.createdAt)}</span>
      </div>
      <p className="mt-1 text-xs text-app-muted">
        {m.journey ? `Journey ${m.journey.journeyKey}, step ${m.journey.stepId}` : 'Sent directly (not from a journey)'}
        {m.template ? ` · template version ${m.template.version}` : ''}
        {m.errorCode ? ` · error ${m.errorCode}` : ''}
      </p>
      <p className="mt-2 text-xs font-medium text-app-muted">Send gate</p>
      {m.decisions.length ? <ul className="mt-1 space-y-1">{m.decisions.map((d) => <Decision key={d.id} d={d} />)}</ul> : <Empty text="Not checked yet (waiting to be sent)." />}
      {m.events.length > 0 && (
        <p className="mt-2 text-xs text-app-muted">Delivery: {m.events.map((e) => `${e.type}${e.errorCode ? ` (${e.errorCode})` : ''} ${formatTime(e.occurredAt)}`).join(' → ')}</p>
      )}
    </li>
  );
}

function Trail({ t }: { t: CustomerTrail }): JSX.Element {
  const p = t.profile;
  return (
    <>
      <header>
        <h1 className="mt-2 break-all font-mono text-lg font-bold text-app">{p.externalId}</h1>
        <p className="mt-1 text-sm text-app-muted">
          {p.identifiers.email ?? 'no email'} · {p.identifiers.phone ?? 'no phone'} · since {formatTime(p.createdAt)}
          {p.erasedAt ? ` · erased ${formatTime(p.erasedAt)}` : ''}
        </p>
        <p className="mt-1 text-sm text-app-muted">
          Marketing consent: {Object.keys(p.consents).length
            ? Object.entries(p.consents).map(([ch, s]) => `${ch} ${s}`).join(', ')
            : 'none recorded'}
        </p>
      </header>

      <Section title="Messages" count={t.messages.length}>
        {t.messages.length ? <ul className="space-y-3">{t.messages.map((m) => <Message key={m.id} m={m} />)}</ul> : <Empty text="No messages." />}
      </Section>

      <Section title="Journeys" count={t.enrollments.length}>
        {t.enrollments.length ? (
          <ul className="space-y-3">
            {t.enrollments.map((e) => (
              <li key={e.id} className="rounded-md border border-app p-3 text-sm" data-testid="trail-enrollment">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-app">{e.journeyName} <span className="text-xs text-app-muted">v{e.version}</span></span>
                  <span className="text-xs text-app-muted">
                    <strong className="text-app">{e.status}</strong>{e.endReason ? ` (${e.endReason.replace(/_/g, ' ')})` : ''}
                    {e.cohort === 'holdout' ? ' · holdout: no messages' : ''} · entered {formatTime(e.enteredAt)}
                  </span>
                </div>
                <ol className="mt-2 space-y-0.5 text-xs text-app-muted">
                  {e.steps.map((s) => (
                    <li key={s.stepId}>
                      {s.stepId} ({s.stepType}): {s.status === 'done' ? (s.outcome ?? 'done').replace(/_/g, ' ') : s.wakeAt ? `waiting until ${formatTime(s.wakeAt)}` : 'in progress'}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        ) : <Empty text="Not in any journey." />}
      </Section>

      <Section title="Consent history" count={t.consents.length}>
        {t.consents.length ? (
          <ul className="space-y-1 text-sm">
            {t.consents.map((c) => (
              <li key={c.id} className="text-app">
                {c.channel} <strong>{c.status}</strong> <span className="text-app-muted">via {c.source.replace(/_/g, ' ')} · {formatTime(c.recordedAt)}</span>
              </li>
            ))}
          </ul>
        ) : <Empty text="No consent records." />}
      </Section>

      <Section title="Suppressed addresses" count={t.suppressions.length}>
        {t.suppressions.length ? (
          <ul className="space-y-1 text-sm">
            {t.suppressions.map((s) => <li key={`${s.channel}:${s.value}`} className="text-app">{s.value} <span className="text-app-muted">({s.channel}, {s.reason.replace(/_/g, ' ')}, {formatTime(s.createdAt)})</span></li>)}
          </ul>
        ) : <Empty text="None." />}
      </Section>

      <Section title="Addresses" count={t.identifiers.length}>
        <ul className="space-y-1 text-sm">
          {t.identifiers.map((i) => (
            <li key={`${i.type}:${i.value}:${i.firstSeenAt}`} className={i.active ? 'text-app' : 'text-app-muted line-through'}>
              {i.value} <span className="text-app-muted no-underline">({i.type}{i.active ? '' : `, replaced ${formatTime(i.deactivatedAt)}`})</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Recent events" count={t.events.length}>
        {t.events.length ? (
          <ul className="space-y-1 text-sm">
            {t.events.map((e) => (
              <li key={e.id} className="text-app">
                {e.name} <span className="text-app-muted">{formatTime(e.occurredAt)}</span>
              </li>
            ))}
          </ul>
        ) : <Empty text="No events." />}
      </Section>
    </>
  );
}

/** One customer's audit trail. Shown in a panel over the customers section. */
export function CustomerDetailPage({ id }: { id: string }): JSX.Element {
  const query = useQuery({ queryKey: ['engage', 'customer-trail', id], queryFn: () => getCustomerTrail(id) });
  return (
    <div data-testid="engage-customer">
      {query.isPending && <p className="text-sm text-app-muted">Loading…</p>}
      {query.isError && (
        <p role="alert" className="text-sm text-red-600">
          {(query.error as { status?: number }).status === 404 ? 'This customer does not exist.' : 'Could not load this customer. Try again.'}
        </p>
      )}
      {query.data && <Trail t={query.data} />}
    </div>
  );
}

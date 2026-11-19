import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiIssues, getCampaign, listCampaigns, listSegments, listTemplates, previewCampaign, resumeCampaign, startCampaign,
  type Campaign, type CampaignPreview, type Issue, type ReadinessProblem,
} from './builderApi';
import { decisionText } from './CustomerDetailPage';
import { JourneyResults } from './JourneyResults';
import { Button, Card, Empty, ErrorLine, Field, Issues, Select, StatusBadge, TextInput, formatTime } from './ui';

/**
 * Campaigns on the Lucy page (WP-38, ADR-018): send one template to one segment, now. A list of what was sent, a wizard
 * that checks the audience and whether sending is ready before it sends, and a panel with the progress and the results
 * of one campaign. A campaign is a one-step journey, so its messages go through the send gate like any other.
 */

/** How often a campaign that is still being sent is refreshed. */
export const PROGRESS_POLL_MS = 3000;

export function CampaignsSection({ onOpen, onNew, pollMs = PROGRESS_POLL_MS }: { onOpen: (id: string) => void; onNew: () => void; pollMs?: number }): JSX.Element {
  const q = useQuery({ queryKey: ['engage', 'campaigns'], queryFn: listCampaigns, refetchInterval: (query) => (query.state.data?.some((c) => c.status === 'sending') ? pollMs : false) });
  return (
    <div data-testid="hub-campaigns">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-app-muted">Send one email to one segment, now. Every message still goes through the send gate and the customer's consent.</p>
        <Button kind="primary" onClick={onNew} testId="new-campaign">New campaign</Button>
      </div>
      {q.isPending && <p className="mt-4 text-sm text-app-muted">Loading…</p>}
      <ErrorLine error={q.error} />
      {q.data && q.data.length === 0 && <Empty>No campaigns yet. A campaign sends one email to one segment, now.</Empty>}
      {q.data && q.data.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-md border border-app">
          <table className="w-full text-left text-sm">
            <thead className="bg-app-muted/10 text-xs uppercase text-app-muted">
              <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Customers</th><th className="hidden px-3 py-2 md:table-cell">Template</th><th className="hidden px-3 py-2 sm:table-cell">Started</th></tr>
            </thead>
            <tbody>
              {q.data.map((c) => (
                <tr key={c.id} className="border-t border-app hover:bg-app-muted/10">
                  <td className="px-3 py-2"><button type="button" onClick={() => onOpen(c.id)} className="font-medium text-app hover:underline">{c.name}</button></td>
                  <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                  <td className="px-3 py-2 text-app">{c.enrolled.toLocaleString('en')}</td>
                  <td className="hidden px-3 py-2 font-mono text-xs text-app-muted md:table-cell">{c.templateKey} v{c.templateVersion}</td>
                  <td className="hidden px-3 py-2 text-app-muted sm:table-cell">{formatTime(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const MODE_NOTE: Record<string, string> = {
  sandbox: 'Sandbox mode: only addresses on the sandbox allow-list receive the email. The others are recorded as blocked.',
  live: 'Live mode: the customers below will receive this email.',
  off: 'Sending is switched off.',
};

function Problems({ problems }: { problems: ReadinessProblem[] }): JSX.Element | null {
  if (!problems.length) return null;
  return (
    <div role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm" data-testid="send-problems">
      <p className="font-medium text-amber-700">Sending is not ready</p>
      <ul className="mt-1 list-disc pl-5 text-app">{problems.map((p) => <li key={p.code}>{p.message}</li>)}</ul>
      <p className="mt-2 text-xs text-app-muted">A platform admin sets these up; the settings screen for it comes with a later release.</p>
    </div>
  );
}

const newKey = (): string => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');

/** Template, segment, a check of who would receive it, then send. Nothing is sent until the admin confirms. */
export function NewCampaignPanel({ onSent }: { onSent: (id: string) => void }): JSX.Element {
  const qc = useQueryClient();
  const templates = useQuery({ queryKey: ['engage', 'templates'], queryFn: listTemplates });
  const segments = useQuery({ queryKey: ['engage', 'segments'], queryFn: listSegments });
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [holdout, setHoldout] = useState('0');
  const [confirmed, setConfirmed] = useState(false);
  // One key per opened wizard: pressing Send twice, or a retry after a timeout, is the same campaign and sends nothing twice.
  const [idempotencyKey] = useState(newKey);
  const [checked, setChecked] = useState<{ forIds: string; preview: CampaignPreview } | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [problems, setProblems] = useState<ReadinessProblem[]>([]);

  const holdoutNumber = Number(holdout);
  const holdoutValid = holdout.trim() !== '' && Number.isInteger(holdoutNumber) && holdoutNumber >= 0 && holdoutNumber <= 50;
  const idsNow = `${templateId}|${segmentId}`;
  const preview = checked && checked.forIds === idsNow ? checked.preview : null;

  const check = useMutation({
    mutationFn: () => previewCampaign({ templateId, segmentId }),
    onSuccess: (p) => { setChecked({ forIds: idsNow, preview: p }); setConfirmed(false); setProblems([]); setIssues([]); },
  });
  const send = useMutation({
    mutationFn: () => startCampaign({ name: name.trim(), templateId, segmentId, holdoutPercent: holdoutNumber, idempotencyKey }),
    onMutate: () => { setIssues([]); setProblems([]); },
    onSuccess: async (r) => { await qc.invalidateQueries({ queryKey: ['engage', 'campaigns'] }); onSent(r.campaign.id); },
    onError: (err) => {
      if (err instanceof ApiIssues && err.issues.length) setIssues(err.issues);
      const body = (err as { body?: { problems?: ReadinessProblem[] } }).body;
      if (body?.problems?.length) setProblems(body.problems);
    },
  });

  /** What the check says can be sent at all: someone would receive it, the template has its unsubscribe link, sending is ready. */
  const sendable = preview !== null && preview.audience.withConsent > 0 && preview.template.hasUnsubscribeLink && preview.readiness.ready;
  const canSend = sendable && Boolean(name.trim()) && confirmed && holdoutValid && !send.isPending;
  const unexpected = send.error && !(send.error instanceof ApiIssues && issues.length) && !problems.length ? send.error : null;

  return (
    <div className="space-y-4" data-testid="new-campaign-panel">
      <Card title="What to send">
        <div className="space-y-3">
          <Field label="Name" hint="for your own reference"><TextInput value={name} onChange={setName} placeholder="Autumn new books" ariaLabel="Campaign name" /></Field>
          <Field label="Email template">
            <Select value={templateId} onChange={setTemplateId} ariaLabel="Campaign template" testId="campaign-template"
              options={[{ value: '', label: templates.isPending ? 'Loading…' : 'Choose a template' }, ...(templates.data ?? []).map((t) => ({ value: t.id, label: `${t.name} (${t.key})` }))]} />
          </Field>
          <Field label="Segment (who receives it)">
            <Select value={segmentId} onChange={setSegmentId} ariaLabel="Campaign segment" testId="campaign-segment"
              options={[{ value: '', label: segments.isPending ? 'Loading…' : 'Choose a segment' }, ...(segments.data ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.key})` }))]} />
          </Field>
          <Field label="Hold back (%)" hint="customers who get no email, so the effect can be measured; 0 to 50">
            <TextInput value={holdout} onChange={setHoldout} ariaLabel="Holdout percent" testId="campaign-holdout" />
          </Field>
          {templates.data?.length === 0 && <p className="text-xs text-app-muted">There is no template yet: create one in the Templates section first.</p>}
          {segments.data?.length === 0 && <p className="text-xs text-app-muted">There is no segment yet: create one in the Segments section first.</p>}
          <Button onClick={() => check.mutate()} disabled={!templateId || !segmentId || check.isPending} testId="check-campaign">Check who would receive it</Button>
          <ErrorLine error={check.error} />
        </div>
      </Card>

      {preview && (
        <Card title="Before it goes out">
          <div className="space-y-2 text-sm text-app" data-testid="campaign-preview">
            <p><span className="text-app-muted">Email: </span>{preview.template.name} v{preview.template.version}, subject "{preview.template.subject}"</p>
            <p><span className="text-app-muted">Segment: </span>{preview.segment.name} v{preview.segment.version}: {preview.audience.inSegment.toLocaleString('en')} customers</p>
            <p data-testid="audience-count">
              <span className="font-semibold">{preview.audience.withConsent.toLocaleString('en')} customers</span> have email consent and would receive it. The others in the segment are left out.
            </p>
            {preview.audience.overCap && <p className="text-amber-700">Only the first {preview.audience.cap.toLocaleString('en')} are sent in one campaign.</p>}
            {preview.audience.withConsent === 0 && <p className="text-amber-700">Nobody in this segment has email consent, so there is nothing to send.</p>}
            {!preview.template.hasUnsubscribeLink && <p className="text-amber-700" data-testid="no-unsubscribe">This template has no unsubscribe link, so every message would be blocked. Add one in the Templates section.</p>}
            {preview.readiness.ready && <p className="text-xs text-app-muted">{MODE_NOTE[preview.readiness.sendMode]}</p>}
            <Problems problems={preview.readiness.problems} />
          </div>
        </Card>
      )}

      {preview && sendable && (
        <Card title="Send">
          <label className="flex items-start gap-2 text-sm text-app">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" data-testid="confirm-campaign" />
            <span>I understand this sends an email to {preview.audience.withConsent.toLocaleString('en')} customers now, and it cannot be undone.</span>
          </label>
          <div className="mt-3"><Button kind="primary" onClick={() => send.mutate()} disabled={!canSend} testId="send-campaign">Send now to {preview.audience.withConsent.toLocaleString('en')} customers</Button></div>
        </Card>
      )}

      <Issues issues={issues} title="The campaign was not sent" />
      <Problems problems={problems} />
      <ErrorLine error={unexpected} />
    </div>
  );
}

const ERROR_TEXT: Record<string, string> = {
  journey_stopped: "The campaign's journey was stopped, so the send ended early. Some customers were not reached.",
  segment_missing: "The segment version this campaign used could not be found, so the send ended early.",
};

/** One campaign: what it was asked to do, how far it got, and what happened to its messages. */
export function CampaignPanel({ id, isAdmin, pollMs = PROGRESS_POLL_MS }: { id: string; isAdmin: boolean; pollMs?: number }): JSX.Element {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['engage', 'campaign', id], queryFn: () => getCampaign(id),
    // Refresh while customers are still being added, or messages are still being created and sent.
    refetchInterval: (query) => (query.state.data && (query.state.data.campaign.status === 'sending' || query.state.data.outcome.inFlight) ? pollMs : false),
  });
  const finish = useMutation({
    mutationFn: () => resumeCampaign(id),
    onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['engage', 'campaign', id] }), qc.invalidateQueries({ queryKey: ['engage', 'campaigns'] })]); },
  });
  if (q.isPending) return <p className="text-sm text-app-muted">Loading…</p>;
  if (q.error || !q.data) return <ErrorLine error={q.error ?? new Error('Not found')} />;
  const c: Campaign = q.data.campaign;
  const o = q.data.outcome;
  const by = (...statuses: string[]) => statuses.reduce((n, st) => n + (o.byStatus[st] ?? 0), 0);
  return (
    <div className="space-y-4" data-testid="engage-campaign">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><h2 className="text-base font-semibold text-app">{c.name}</h2><StatusBadge status={c.status} /></div>
        {isAdmin && c.status === 'sending' && <Button onClick={() => finish.mutate()} disabled={finish.isPending} testId="finish-campaign">Finish sending</Button>}
      </div>
      <ErrorLine error={finish.error} />
      <Card title="What was sent">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div><dt className="inline text-app-muted">Email: </dt><dd className="inline font-mono text-xs text-app">{c.templateKey} v{c.templateVersion}</dd></div>
          <div><dt className="inline text-app-muted">Segment: </dt><dd className="inline font-mono text-xs text-app">{c.segmentKey} v{c.segmentVersion}</dd></div>
          <div><dt className="inline text-app-muted">Started: </dt><dd className="inline text-app">{formatTime(c.createdAt)}</dd></div>
          <div><dt className="inline text-app-muted">Finished: </dt><dd className="inline text-app">{c.finishedAt ? formatTime(c.finishedAt) : '—'}</dd></div>
          <div><dt className="inline text-app-muted">Customers with consent: </dt><dd className="inline text-app" data-testid="campaign-enrolled">{c.enrolled.toLocaleString('en')}</dd></div>
          <div><dt className="inline text-app-muted">Held back: </dt><dd className="inline text-app">{c.holdoutPercent}%</dd></div>
        </dl>
        {c.status === 'sending' && <p className="mt-2 text-sm text-app-muted">Adding customers… {c.enrolled.toLocaleString('en')} so far.</p>}
        {c.truncated && <p className="mt-2 text-sm text-amber-700">The audience was capped at one campaign's limit; the rest were not sent.</p>}
        {c.error && <p className="mt-2 text-sm text-red-600">{ERROR_TEXT[c.error] ?? c.error.replace(/_/g, ' ')}</p>}
      </Card>
      <Card title="What happened">
        <div className="space-y-1 text-sm text-app" data-testid="campaign-outcome">
          {o.messages === 0 && o.inFlight && <p className="text-app-muted">Preparing the messages…</p>}
          {o.messages > 0 && (
            <>
              <p><span className="text-app-muted">Sent or delivered: </span><span className="font-semibold" data-testid="campaign-sent">{by('sent', 'delivered').toLocaleString('en')}</span></p>
              <div>
                <p><span className="text-app-muted">Blocked by the send gate: </span><span className="font-semibold" data-testid="campaign-blocked">{by('blocked').toLocaleString('en')}</span></p>
                {Object.keys(o.blockedBecause).length > 0 && (
                  <ul className="ml-5 list-disc text-xs text-app-muted" data-testid="campaign-blocked-because">
                    {Object.entries(o.blockedBecause).map(([code, n]) => <li key={code}>{decisionText(code)}: {n.toLocaleString('en')}</li>)}
                  </ul>
                )}
              </div>
              {by('failed', 'bounced') > 0 && <p><span className="text-app-muted">Failed or bounced: </span>{by('failed', 'bounced').toLocaleString('en')}</p>}
              {by('queued', 'sending') > 0 && <p><span className="text-app-muted">Still waiting to be sent: </span>{by('queued', 'sending').toLocaleString('en')}</p>}
            </>
          )}
          {o.heldOut > 0 && <p><span className="text-app-muted">Held back, no email by design: </span>{o.heldOut.toLocaleString('en')}</p>}
          {o.messages === 0 && !o.inFlight && o.heldOut === 0 && <p className="text-app-muted">No messages were created.</p>}
          {o.inFlight && o.messages > 0 && <p className="text-xs text-app-muted">Still in progress; this refreshes by itself.</p>}
        </div>
      </Card>
      {c.holdoutPercent > 0 && <JourneyResults journeyId={c.journeyId} />}
    </div>
  );
}

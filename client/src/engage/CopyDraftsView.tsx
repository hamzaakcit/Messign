import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  approveCopyDraft, getJourney, listCopyDrafts, listJourneys, rejectCopyDraft, requestCopyDraft, type CopyDraft, type CopyStatus,
} from './builderApi';
import { BRIEF_MAX, briefProblem, messageSteps, reasonText } from './copyDraftText';
import { Button, Card, Empty, ErrorLine, Field, Select, StatusBadge, formatTime, inputClass } from './ui';

/**
 * AI copy drafts (WP-24, ADR-019): the approval queue for copy that the AI drafted for a journey's message step. An admin
 * asks for a draft, reads it, and approves it (which adds the next template version) or rejects it. Nothing sends from
 * here. The copy is shown in a sandboxed frame, the same way template previews are.
 */

/** The reason codes a refused draft carries on a 422 (the server sends codes, never the copy). */
export function refusalReasons(err: unknown): string[] | null {
  const reasons = (err as { body?: { reasons?: unknown } }).body?.reasons;
  return Array.isArray(reasons) && reasons.every((r) => typeof r === 'string') ? reasons as string[] : null;
}

const STATUSES: Array<{ value: CopyStatus; label: string }> = [
  { value: 'pending', label: 'Waiting for approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

/** The "AI copy drafts" entry on the Templates section: opens the queue and shows how many wait. */
export function CopyDraftsEntry({ onOpen }: { onOpen: () => void }): JSX.Element {
  const pending = useQuery({ queryKey: ['engage', 'copy-drafts', 'pending'], queryFn: () => listCopyDrafts('pending') });
  const n = pending.data?.length;
  return (
    <button type="button" onClick={onOpen} data-testid="open-copy-drafts"
      className="mt-4 flex w-full flex-wrap items-center justify-between gap-2 rounded-md border border-app-border px-3 py-2 text-left text-sm hover:bg-app-muted/10">
      <span className="font-medium text-app-text">AI copy drafts</span>
      <span className="text-xs text-app-muted" data-testid="copy-drafts-pending">{n === undefined ? '' : n === 0 ? 'none waiting' : `${n} waiting for approval`}</span>
    </button>
  );
}

/** Asks for a draft: a journey, one of its message steps, a language and a brief. The brief must not name anyone. */
function AskForDraft({ onAsked }: { onAsked: () => void }): JSX.Element {
  const [journeyId, setJourneyId] = useState('');
  const [stepId, setStepId] = useState('');
  const [language, setLanguage] = useState<'tr' | 'en'>('tr');
  const [brief, setBrief] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[] | null>(null);
  const journeys = useQuery({ queryKey: ['engage', 'journeys'], queryFn: listJourneys });
  const journey = useQuery({ queryKey: ['engage', 'journey', journeyId], queryFn: () => getJourney(journeyId), enabled: journeyId !== '' });
  const steps = messageSteps(journey.data?.versions[0]?.definition);
  const problem = brief.length > 0 ? briefProblem(brief) : null;
  const ask = useMutation({
    mutationFn: () => requestCopyDraft({ journeyId, stepId, brief: brief.trim(), language }),
    onSuccess: (r) => {
      setNotice(`Draft saved for approval${r.pinnedVersion !== null ? `. This step pins version ${r.pinnedVersion}, so the draft reaches it only after the journey moves to a new version` : ''}.`);
      setReasons(null); setBrief(''); onAsked();
    },
    onError: (err) => { setNotice(null); setReasons(refusalReasons(err)); },
  });
  const canAsk = journeyId !== '' && stepId !== '' && brief.trim().length > 0 && problem === null && !ask.isPending;
  return (
    <div className="space-y-3" data-testid="ask-copy-form">
      <p className="text-sm text-app-muted">Describe what the message should say. The brief goes to the AI model, so do not put customer names, contact details or order details in it.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Journey">
          <Select value={journeyId} onChange={(v) => { setJourneyId(v); setStepId(''); }} ariaLabel="Journey for the draft" testId="copy-journey"
            options={[{ value: '', label: 'Choose a journey' }, ...(journeys.data ?? []).map((j) => ({ value: j.id, label: j.name }))]} />
        </Field>
        <Field label="Message step">
          <Select value={stepId} onChange={setStepId} ariaLabel="Message step for the draft" testId="copy-step"
            options={[{ value: '', label: journeyId ? (steps.length ? 'Choose a step' : 'No message steps') : 'Choose a journey first' }, ...steps.map((s) => ({ value: s.id, label: s.label }))]} />
        </Field>
        <Field label="Language">
          <Select value={language} onChange={setLanguage} ariaLabel="Language of the copy" testId="copy-language"
            options={[{ value: 'tr', label: 'Turkish' }, { value: 'en', label: 'English' }]} />
        </Field>
      </div>
      <Field label="Brief" hint={`${brief.trim().length}/${BRIEF_MAX}`}>
        <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4} maxLength={BRIEF_MAX} aria-label="Brief" data-testid="copy-brief"
          placeholder="A reminder for shoppers who left books in their basket. Warm tone, mention free shipping, one call to action." className={inputClass} />
      </Field>
      {problem && brief.length > 0 && <p className="text-xs text-app-muted">{problem}</p>}
      {reasons && (
        <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm" data-testid="copy-refused">
          <p className="font-medium text-red-600">The draft was not saved</p>
          <ul className="mt-1 list-disc pl-5 text-app-text">{reasons.map((r) => <li key={r}>{reasonText(r)}</li>)}</ul>
        </div>
      )}
      {notice && <p role="status" className="text-sm text-app-text" data-testid="copy-notice">{notice}</p>}
      <ErrorLine error={reasons ? null : ask.error} />
      <Button kind="primary" onClick={() => ask.mutate()} disabled={!canAsk} testId="ask-copy-draft">{ask.isPending ? 'Drafting…' : 'Ask for a draft'}</Button>
    </div>
  );
}

/** One draft: its copy, what it was asked for, and (for an admin, while pending) approve and reject. */
function DraftCard({ draft, journeyName, isAdmin }: { draft: CopyDraft; journeyName: string; isAdmin: boolean }): JSX.Element {
  const qc = useQueryClient();
  const [result, setResult] = useState<string | null>(null);
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['engage', 'copy-drafts'] }),
    qc.invalidateQueries({ queryKey: ['engage', 'templates'] }),
  ]);
  const approve = useMutation({
    mutationFn: () => approveCopyDraft(draft.id),
    onSuccess: (r) => { setResult(`Approved. The template now has version ${r.templateVersion}.`); void refresh(); },
  });
  const reject = useMutation({ mutationFn: () => rejectCopyDraft(draft.id), onSuccess: () => { setResult('Rejected. Nothing was added.'); void refresh(); } });
  const pending = draft.status === 'pending';
  return (
    <Card title={`${journeyName} · ${draft.stepId} · ${draft.purpose} · ${draft.language.toUpperCase()}`} actions={<StatusBadge status={draft.status} />}>
      <p className="mb-2 text-sm text-app-text"><span className="text-app-muted">Subject: </span>{draft.subject}</p>
      {draft.html !== null ? (
        // Sandboxed: no scripts, no same-origin access; the copy is the AI's text, shown the way a template preview is.
        <iframe title={`Draft ${draft.id}`} sandbox="" srcDoc={draft.html} className="h-64 w-full rounded-md bg-white" />
      ) : (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-app-border p-2 text-xs text-app-text">{draft.text}</pre>
      )}
      <p className="mt-2 text-xs text-app-muted">Brief: {draft.brief}</p>
      <p className="text-xs text-app-muted">Asked {formatTime(draft.createdAt)}{draft.decidedAt ? ` · decided ${formatTime(draft.decidedAt)}` : ''}</p>
      {draft.status === 'approved' && draft.templateVersion !== null && <p className="mt-1 text-xs text-app-muted">Template version {draft.templateVersion}</p>}
      {pending && isAdmin && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button kind="primary" onClick={() => approve.mutate()} disabled={approve.isPending || reject.isPending} testId={`approve-${draft.id}`}>Approve as new template version</Button>
          <Button kind="danger" onClick={() => reject.mutate()} disabled={approve.isPending || reject.isPending} testId={`reject-${draft.id}`}>Reject</Button>
        </div>
      )}
      {result && <p role="status" className="mt-2 text-sm text-app-text">{result}</p>}
      <ErrorLine error={approve.error ?? reject.error} />
    </Card>
  );
}

/** The copy drafts panel: ask (admins), then the queue by status. */
export function CopyDraftsPanel({ isAdmin }: { isAdmin: boolean }): JSX.Element {
  const [status, setStatus] = useState<CopyStatus>('pending');
  const qc = useQueryClient();
  const drafts = useQuery({ queryKey: ['engage', 'copy-drafts', status], queryFn: () => listCopyDrafts(status) });
  const journeys = useQuery({ queryKey: ['engage', 'journeys'], queryFn: listJourneys });
  const names = new Map((journeys.data ?? []).map((j) => [j.id, j.name]));
  return (
    <div className="space-y-4" data-testid="copy-drafts-panel">
      <p className="text-sm text-app-muted">
        AI drafts of message copy. A draft is not sent and changes nothing until an admin approves it; approval adds it as the next version of the step's template.
      </p>
      {isAdmin && (
        <Card title="Ask for a draft">
          <AskForDraft onAsked={() => void qc.invalidateQueries({ queryKey: ['engage', 'copy-drafts'] })} />
        </Card>
      )}
      <div role="tablist" aria-label="Draft status" className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <button key={s.value} type="button" role="tab" aria-selected={status === s.value} onClick={() => setStatus(s.value)}
            data-testid={`copy-status-${s.value}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${status === s.value ? 'border-violet-400/60 bg-violet-500/15 text-app-text' : 'border-app-border text-app-muted hover:text-app-text'}`}>
            {s.label}
          </button>
        ))}
      </div>
      <ErrorLine error={drafts.error} />
      {drafts.isPending && <p className="text-sm text-app-muted">Loading…</p>}
      {drafts.data && drafts.data.length === 0 && <Empty>{status === 'pending' ? 'No drafts are waiting for approval.' : 'No drafts here.'}</Empty>}
      {drafts.data?.map((d) => <DraftCard key={d.id} draft={d} journeyName={names.get(d.journeyId) ?? 'Journey'} isAdmin={isAdmin} />)}
    </div>
  );
}

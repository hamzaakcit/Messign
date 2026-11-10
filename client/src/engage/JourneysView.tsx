import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import {
  activateVersion, approveVersion, getJourney, listJourneys, listSegmentRuns, stopJourney, type JourneyVersion,
} from './builderApi';
import { JourneyEditor } from './JourneyEditor';
import { JourneyResults } from './JourneyResults';
import { definitionToForm, describeStep } from './journeyForm';
import { Button, Card, Empty, ErrorLine, StatusBadge, formatTime } from './ui';

/**
 * Journeys inside the Lucy hub (WP-20): the list is a section of the page, and a journey, its results, its versions and
 * the editor open in panels over it. Nothing here is a page of its own.
 */

const refresh = (qc: ReturnType<typeof useQueryClient>, id?: string) => Promise.all([
  qc.invalidateQueries({ queryKey: ['engage', 'journeys'] }),
  ...(id ? [qc.invalidateQueries({ queryKey: ['engage', 'journey', id] })] : []),
]);

export function JourneysSection({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }): JSX.Element {
  const q = useQuery({ queryKey: ['engage', 'journeys'], queryFn: listJourneys });
  return (
    <div data-testid="hub-journeys">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-app-muted">Automated sequences: a trigger, waits, conditions and emails. Each change is a new version that an admin approves.</p>
        <Button kind="primary" onClick={onNew} testId="new-journey">New journey</Button>
      </div>
      {q.isPending && <p className="mt-4 text-sm text-app-muted">Loading…</p>}
      <ErrorLine error={q.error} />
      {q.data && q.data.length === 0 && <Empty>No journeys yet.</Empty>}
      {q.data && q.data.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-md border border-app">
          <table className="w-full text-left text-sm">
            <thead className="bg-app-muted/10 text-xs uppercase text-app-muted">
              <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Key</th><th className="px-3 py-2">Status</th><th className="hidden px-3 py-2 sm:table-cell">Created</th></tr>
            </thead>
            <tbody>
              {q.data.map((j) => (
                <tr key={j.id} className="border-t border-app hover:bg-app-muted/10">
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => onOpen(j.id)} className="font-medium text-app hover:underline">{j.name}</button>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-app-muted">{j.key}</td>
                  <td className="px-3 py-2">
                    {j.activeVersion
                      ? <><StatusBadge status="active" /> <span className="ml-2 text-xs text-app-muted">v{j.activeVersion}</span></>
                      : <span className="text-xs text-app-muted">not running (latest v{j.latestVersion})</span>}
                  </td>
                  <td className="hidden px-3 py-2 text-app-muted sm:table-cell">{formatTime(j.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function VersionCard({ journeyId, v, isAdmin, onNewVersion }: { journeyId: string; v: JourneyVersion; isAdmin: boolean; onNewVersion: (from: number) => void }): JSX.Element {
  const qc = useQueryClient();
  const [open, setOpen] = useState(v.status !== 'retired');
  const act = useMutation({
    mutationFn: (what: 'approve' | 'activate') => (what === 'approve' ? approveVersion(journeyId, v.version) : activateVersion(journeyId, v.version)),
    onSuccess: () => refresh(qc, journeyId),
  });
  const form = definitionToForm(v.definition);
  const t = (v.definition.trigger ?? {}) as Record<string, unknown>;
  return (
    <li className="rounded-md border border-app p-3" data-testid={`version-${v.version}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-app">Version {v.version}</span>
          <StatusBadge status={v.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && v.status === 'draft' && <Button kind="primary" onClick={() => act.mutate('approve')} disabled={act.isPending} testId={`approve-${v.version}`}>Approve</Button>}
          {isAdmin && v.status === 'approved' && <Button kind="primary" onClick={() => act.mutate('activate')} disabled={act.isPending} testId={`activate-${v.version}`}>Activate</Button>}
          <Button onClick={() => onNewVersion(v.version)}>New version from this</Button>
          <Button onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</Button>
        </div>
      </div>
      <p className="mt-1 text-xs text-app-muted">
        Created {formatTime(v.createdAt)}
        {v.approvedAt ? ` · approved ${formatTime(v.approvedAt)}` : ''}
        {v.activatedAt ? ` · activated ${formatTime(v.activatedAt)}` : ''}
        {v.deactivatedAt ? ` · retired ${formatTime(v.deactivatedAt)}` : ''}
      </p>
      <ErrorLine error={act.error} />
      {open && (
        <div className="mt-3 text-sm">
          <p className="text-app">
            <span className="text-app-muted">Starts: </span>
            {t.type === 'event' ? `when ${String(t.event)} arrives${t.filter ? ' (filtered)' : ''}` : t.type === 'api' ? 'through the trigger API'
              : t.type === 'segment' ? `every ${String(t.every_days)} day(s) at ${String(t.at_local_time)} for segment ${String(t.segment)} v${String(t.segment_version)}` : String(t.type)}
          </p>
          {form.ok ? (
            <>
              {form.form.exitEvents.length > 0 && <p className="text-app"><span className="text-app-muted">Stops early on: </span>{form.form.exitEvents.join(', ')}</p>}
              <p className="text-app"><span className="text-app-muted">Holdout: </span>{form.form.holdoutPercent}% · <span className="text-app-muted">re-entry: </span>{form.form.reEntry === 'never' ? 'once only' : 'after the previous time ended'}</p>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-app">
                {form.form.steps.map((s) => <li key={s.id}><span className="font-mono text-xs text-app-muted">{s.id}</span> {describeStep(s)}</li>)}
              </ol>
            </>
          ) : <pre className="mt-2 overflow-x-auto rounded bg-app-muted/10 p-2 text-xs text-app">{JSON.stringify(v.definition, null, 2)}</pre>}
        </div>
      )}
    </li>
  );
}

function SegmentRuns({ journeyId }: { journeyId: string }): JSX.Element {
  const q = useQuery({ queryKey: ['engage', 'segment-runs', journeyId], queryFn: () => listSegmentRuns(journeyId) });
  return (
    <Card title="Scheduled runs">
      {q.data && q.data.length === 0 && <p className="text-sm text-app-muted">No run yet. The first one is at the first scheduled time after activation.</p>}
      {q.data && q.data.length > 0 && (
        <ul className="space-y-1 text-sm">
          {q.data.map((r) => (
            <li key={r.id} className="text-app">
              {formatTime(r.slot)} <StatusBadge status={r.status} />{' '}
              <span className="text-app-muted">{r.matched} matched · {r.enrolled} entered · {r.skipped} already in or not allowed back{r.truncated ? ' · capped' : ''}{r.error ? ` · ${r.error.replace(/_/g, ' ')}` : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** A journey: its status, versions with approve / activate / stop, results and scheduled runs. Shown in a panel. */
export function JourneyPanel({ id, onNewVersion }: { id: string; onNewVersion: (from: number) => void }): JSX.Element {
  const qc = useQueryClient();
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const q = useQuery({ queryKey: ['engage', 'journey', id], queryFn: () => getJourney(id) });
  const stop = useMutation({ mutationFn: () => stopJourney(id), onSuccess: () => refresh(qc, id) });
  const [confirming, setConfirming] = useState(false);
  if (q.isPending) return <p className="text-sm text-app-muted">Loading…</p>;
  if (q.error || !q.data) return <ErrorLine error={q.error ?? new Error('Not found')} />;
  const { journey, versions } = q.data;
  const active = versions.find((v) => v.status === 'active');
  const isSegment = versions.some((v) => (v.definition.trigger as { type?: string } | undefined)?.type === 'segment');
  return (
    <div className="space-y-4" data-testid="engage-journey">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-app-muted">
          Key <code className="font-mono">{journey.key}</code> · {active ? `running version ${active.version}` : 'not running'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => onNewVersion(versions[0]?.version ?? 1)}>New version</Button>
          {isAdmin && active && (confirming
            ? <><Button kind="danger" onClick={() => { stop.mutate(); setConfirming(false); }} testId="confirm-stop">Yes, stop it</Button><Button onClick={() => setConfirming(false)}>Cancel</Button></>
            : <Button kind="danger" onClick={() => setConfirming(true)} testId="stop-journey">Stop journey</Button>)}
        </div>
      </div>
      {!isAdmin && <p className="text-xs text-app-muted">Only a tenant admin can approve, activate or stop a journey.</p>}
      <ErrorLine error={stop.error} />
      {confirming && <p className="text-sm text-amber-700">Stopping ends the journey for everyone in it now. To run it again, publish and approve a new version.</p>}
      <JourneyResults journeyId={id} />
      <Card title="Versions">
        <ul className="space-y-3">{versions.map((v) => <VersionCard key={v.id} journeyId={id} v={v} isAdmin={isAdmin} onNewVersion={onNewVersion} />)}</ul>
      </Card>
      {isSegment && <SegmentRuns journeyId={id} />}
    </div>
  );
}

/** The editor for a new journey, or a new version of an existing one (starting from `from`). */
export function JourneyEditPanel({ journeyId, from, onSaved }: { journeyId?: string; from?: number; onSaved: (id: string) => void }): JSX.Element {
  const q = useQuery({ queryKey: ['engage', 'journey', journeyId], queryFn: () => getJourney(journeyId!), enabled: Boolean(journeyId) });
  if (!journeyId) return <JourneyEditor target={{ kind: 'create' }} onSaved={onSaved} />;
  if (!q.data) return q.error ? <ErrorLine error={q.error} /> : <p className="text-sm text-app-muted">Loading…</p>;
  const base = q.data.versions.find((v) => v.version === from) ?? q.data.versions[0];
  return (
    <div className="space-y-3">
      <p className="text-sm text-app-muted">Starting from version {base?.version}. The running version keeps running until a new one is activated.</p>
      <JourneyEditor key={`${journeyId}-${base?.version}`} target={{ kind: 'version', journeyId, journeyName: q.data.journey.name }}
        initialDefinition={base?.definition} onSaved={onSaved} />
    </div>
  );
}

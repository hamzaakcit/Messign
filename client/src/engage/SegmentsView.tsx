import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ApiIssues, addSegmentVersion, countSegmentVersion, createSegment, getSegment, listSegments, previewSegment, type Issue, type SegmentCount,
} from './builderApi';
import { OPS, conditionToLeaf, leafToCondition, type LeafForm, type Op } from './journeyForm';
import { Button, Card, Empty, ErrorLine, Field, Issues, LinkButton, Page, Select, TextInput, formatTime, inputClass } from './ui';

/**
 * Segments (WP-20 screens over the WP-36 API): list, create, versions and counts. A segment is a list of conditions
 * that all (or any) must hold, over customer attributes, order history and email consent; anything richer is JSON.
 */

export const SEGMENT_FIELDS = [
  'orders.count', 'orders.count_30d', 'orders.count_90d', 'orders.count_365d', 'orders.total_spent', 'orders.total_spent_365d',
  'orders.days_since_last', 'orders.days_since_first', 'consent.email', 'attributes.',
] as const;
const OP_LABEL: Record<Op, string> = {
  eq: 'is', neq: 'is not', gt: '>', gte: '≥', lt: '<', lte: '≤', contains: 'contains', in: 'is one of', exists: 'is set', not_exists: 'is not set',
};

export interface SegmentRows { combine: 'all' | 'any'; rows: LeafForm[] }

export function rowsToDefinition(r: SegmentRows): Record<string, unknown> {
  const leaves = r.rows.map(leafToCondition);
  return { where: leaves.length === 1 ? leaves[0] : { [r.combine]: leaves } };
}

/** Rows for a stored definition: one condition, or all/any of single conditions; otherwise null (edit as JSON). */
export function definitionToRows(def: unknown): SegmentRows | null {
  const where = (def as { where?: unknown } | null)?.where;
  const single = conditionToLeaf(where);
  if (single) return { combine: 'all', rows: [single] };
  if (!where || typeof where !== 'object') return null;
  const w = where as Record<string, unknown>;
  const combine = Array.isArray(w.all) ? 'all' : Array.isArray(w.any) ? 'any' : null;
  if (!combine) return null;
  const rows = (w[combine] as unknown[]).map(conditionToLeaf);
  return rows.every((x): x is LeafForm => x !== null) ? { combine, rows } : null;
}

const defaultRows = (): SegmentRows => ({ combine: 'all', rows: [
  { field: 'orders.count', op: 'gte', value: '1' }, { field: 'orders.days_since_last', op: 'gte', value: '90' }, { field: 'consent.email', op: 'eq', value: 'granted' },
] });

function DefinitionEditor({ initial, onSave, saveLabel }: { initial?: unknown; onSave: (definition: unknown) => Promise<void>; saveLabel: string }): JSX.Element {
  const startRows = initial === undefined ? defaultRows() : definitionToRows(initial);
  const [rows, setRows] = useState<SegmentRows>(startRows ?? defaultRows());
  const [mode, setMode] = useState<'rows' | 'json'>(startRows ? 'rows' : 'json');
  const [json, setJson] = useState(JSON.stringify(initial ?? rowsToDefinition(defaultRows()), null, 2));
  const [note, setNote] = useState<string | null>(startRows ? null : 'This segment combines conditions in a way the form does not show. Edit it as JSON.');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [count, setCount] = useState<SegmentCount | null>(null);
  const [busy, setBusy] = useState(false);

  const definition = (): unknown => {
    if (mode === 'rows') return rowsToDefinition(rows);
    try { return JSON.parse(json); } catch { throw new ApiIssues('Not valid JSON', [{ path: '(json)', message: 'This is not valid JSON.' }]); }
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setIssues([]); setError(null);
    try { await fn(); } catch (err) { if (err instanceof ApiIssues && err.issues.length) setIssues(err.issues); else setError(err); } finally { setBusy(false); }
  };
  const toJson = () => { setJson(JSON.stringify(rowsToDefinition(rows), null, 2)); setMode('json'); setNote(null); };
  const toRows = () => {
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { setNote('This is not valid JSON.'); return; }
    const r = definitionToRows(parsed);
    if (!r) { setNote('The form cannot show this combination. Keep editing it as JSON.'); return; }
    setRows(r); setMode('rows'); setNote(null);
  };
  const setRow = (i: number, l: LeafForm) => setRows({ ...rows, rows: rows.rows.map((x, j) => (j === i ? l : x)) });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button kind={mode === 'rows' ? 'primary' : 'secondary'} onClick={() => (mode === 'json' ? toRows() : undefined)}>Conditions</Button>
        <Button kind={mode === 'json' ? 'primary' : 'secondary'} onClick={() => (mode === 'rows' ? toJson() : undefined)}>JSON</Button>
      </div>
      {mode === 'json' ? (
        <>
          {note && <p className="text-sm text-amber-700">{note}</p>}
          <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={14} spellCheck={false} aria-label="Segment definition JSON" className={`${inputClass} font-mono text-xs`} />
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm text-app">
            Customers who match
            <div className="w-28"><Select value={rows.combine} onChange={(combine) => setRows({ ...rows, combine })} options={[{ value: 'all', label: 'all' }, { value: 'any', label: 'any' }]} ariaLabel="Combine" /></div>
            of these:
          </div>
          <datalist id="segment-fields">{SEGMENT_FIELDS.map((f) => <option key={f} value={f} />)}</datalist>
          <ul className="space-y-2">
            {rows.rows.map((r, i) => (
              <li key={i} className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr_auto]">
                <input list="segment-fields" value={r.field} onChange={(e) => setRow(i, { ...r, field: e.target.value })} aria-label={`Condition ${i + 1} field`} className={`${inputClass} font-mono`} />
                <Select value={r.op} onChange={(op) => setRow(i, { ...r, op })} options={OPS.map((o) => ({ value: o, label: OP_LABEL[o] }))} ariaLabel={`Condition ${i + 1} operator`} />
                {r.op === 'exists' || r.op === 'not_exists' ? <span /> : <TextInput value={r.value} onChange={(value) => setRow(i, { ...r, value })} ariaLabel={`Condition ${i + 1} value`} />}
                <Button onClick={() => setRows({ ...rows, rows: rows.rows.filter((_, j) => j !== i) })} disabled={rows.rows.length === 1}>Remove</Button>
              </li>
            ))}
          </ul>
          <Button onClick={() => setRows({ ...rows, rows: [...rows.rows, { field: 'attributes.', op: 'eq', value: '' }] })}>Add condition</Button>
          <p className="text-xs text-app-muted">Order history counts order_completed events up to now. days_since_last is empty for customers who never ordered. consent.email is granted or revoked.</p>
        </>
      )}
      <Issues issues={issues} />
      <ErrorLine error={error} />
      {count && (
        <p className="text-sm text-app" data-testid="segment-count">
          <strong>{count.count}</strong> customer{count.count === 1 ? '' : 's'} match now
          {count.sample.length > 0 && <span className="text-app-muted"> (for example {count.sample.slice(0, 5).map((s) => s.externalId).join(', ')})</span>}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void run(async () => setCount(await previewSegment(definition())))} disabled={busy} testId="count-segment">Count</Button>
        <Button kind="primary" onClick={() => void run(() => onSave(definition()))} disabled={busy} testId="save-segment">{saveLabel}</Button>
      </div>
    </div>
  );
}

function SegmentList(): JSX.Element {
  const q = useQuery({ queryKey: ['engage', 'segments'], queryFn: listSegments });
  return (
    <Page title="Segments" testId="engage-segments" actions={<LinkButton to="/segments/new" kind="primary">New segment</LinkButton>}>
      <p className="text-sm text-app-muted">Audiences over attributes, order history and consent. A scheduled journey targets one version of a segment.</p>
      {q.isPending && <p className="mt-4 text-sm text-app-muted">Loading…</p>}
      <ErrorLine error={q.error} />
      {q.data && q.data.length === 0 && <Empty>No segments yet.</Empty>}
      {q.data && q.data.length > 0 && (
        <ul className="mt-4 divide-y divide-app rounded-md border border-app">
          {q.data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <Link to={`/segments/${s.id}`} className="font-medium text-app hover:underline">{s.name}</Link>
              <span className="text-xs text-app-muted"><code className="font-mono">{s.key}</code> · v{s.latestVersion} · {formatTime(s.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

function NewSegment(): JSX.Element {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  return (
    <Page title="New segment" back={{ to: '/segments', label: 'Segments' }}>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Field label="Name"><TextInput value={name} onChange={setName} placeholder="Lapsed buyers" ariaLabel="Segment name" /></Field>
        <Field label="Key" hint="what a journey refers to"><TextInput value={key} onChange={setKey} placeholder="lapsed" ariaLabel="Segment key" mono /></Field>
      </div>
      <DefinitionEditor saveLabel="Save segment" onSave={async (definition) => {
        const r = await createSegment({ key: key.trim(), name: name.trim(), definition });
        await qc.invalidateQueries({ queryKey: ['engage', 'segments'] });
        navigate(`/segments/${r.segment.id}`);
      }} />
    </Page>
  );
}

function VersionCount({ id, version }: { id: string; version: number }): JSX.Element {
  const c = useMutation({ mutationFn: () => countSegmentVersion(id, version) });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => c.mutate()} disabled={c.isPending}>Count v{version} now</Button>
      {c.data && <span className="text-sm text-app"><strong>{c.data.count}</strong> customers</span>}
      <ErrorLine error={c.error} />
    </div>
  );
}

function SegmentDetail({ id }: { id: string }): JSX.Element {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['engage', 'segment', id], queryFn: () => getSegment(id) });
  const [editing, setEditing] = useState(false);
  if (!q.data) return <Page title="Segment" back={{ to: '/segments', label: 'Segments' }}>{q.error ? <ErrorLine error={q.error} /> : <p className="text-sm text-app-muted">Loading…</p>}</Page>;
  const { segment, versions } = q.data;
  return (
    <Page title={segment.name} back={{ to: '/segments', label: 'Segments' }} actions={!editing && <Button onClick={() => setEditing(true)}>New version</Button>}>
      <p className="text-sm text-app-muted">Key <code className="font-mono">{segment.key}</code>. Versions never change; a journey keeps the version it was approved with.</p>
      {editing && (
        <Card title={`New version (from v${versions[0]?.version})`}>
          <DefinitionEditor initial={versions[0]?.definition} saveLabel="Save new version" onSave={async (definition) => {
            await addSegmentVersion(id, definition);
            setEditing(false);
            await qc.invalidateQueries({ queryKey: ['engage', 'segment', id] });
          }} />
        </Card>
      )}
      {versions.map((v) => (
        <Card key={v.id} title={`Version ${v.version} · ${formatTime(v.createdAt)}`}>
          <pre className="mb-2 overflow-x-auto rounded bg-app-muted/10 p-2 text-xs text-app">{JSON.stringify(v.definition, null, 2)}</pre>
          <VersionCount id={id} version={v.version} />
        </Card>
      ))}
    </Page>
  );
}

export function SegmentsView(): JSX.Element {
  const { pathname } = useLocation();
  if (pathname === '/segments/new') return <NewSegment />;
  const detail = /^\/segments\/([^/]+)\/?$/.exec(pathname);
  if (detail) return <SegmentDetail key={detail[1]} id={decodeURIComponent(detail[1]!)} />;
  return <SegmentList />;
}

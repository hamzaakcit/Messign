import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ApiIssues, addTemplateVersion, createTemplate, getTemplate, listTemplates, previewTemplate, type Issue, type TemplatePreview,
} from './builderApi';
import { Button, Card, Empty, ErrorLine, Field, Issues, LinkButton, Page, TextInput, formatTime, inputClass } from './ui';

/**
 * Email templates (WP-20 screens over the WP-14 API): list, create, versions and a rendered preview. Variables:
 * {{first_name}} (customer attribute), {{payload.cart_id}} (from the trigger), {{unsubscribe_url}} (required for
 * marketing), with an optional | default: "text".
 */

const STARTER = '<p>Hello {{first_name | default: "there"}},</p>\n<p>…</p>\n<p style="font-size:12px;color:#666">To stop these emails, <a href="{{unsubscribe_url}}">unsubscribe</a>.</p>';

function ContentForm({ initial, onSave, saveLabel }: { initial: { subject: string; html: string }; onSave: (v: { subject: string; html: string }) => Promise<void>; saveLabel: string }): JSX.Element {
  const [subject, setSubject] = useState(initial.subject);
  const [html, setHtml] = useState(initial.html);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setIssues([]); setError(null);
    try { await onSave({ subject, html }); } catch (err) {
      if (err instanceof ApiIssues && err.issues.length) setIssues(err.issues); else setError(err);
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <Field label="Subject"><TextInput value={subject} onChange={setSubject} ariaLabel="Subject" /></Field>
      <Field label="HTML" hint="paste the HTML exported from your editor">
        <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={14} spellCheck={false} aria-label="HTML" className={`${inputClass} font-mono text-xs`} />
      </Field>
      <Issues issues={issues} />
      <ErrorLine error={error} />
      <Button kind="primary" onClick={() => void save()} disabled={busy} testId="save-template">{saveLabel}</Button>
    </div>
  );
}

function TemplateList(): JSX.Element {
  const q = useQuery({ queryKey: ['engage', 'templates'], queryFn: listTemplates });
  return (
    <Page title="Email templates" testId="engage-templates" actions={<LinkButton to="/templates/new" kind="primary">New template</LinkButton>}>
      {q.isPending && <p className="text-sm text-app-muted">Loading…</p>}
      <ErrorLine error={q.error} />
      {q.data && q.data.length === 0 && <Empty>No templates yet.</Empty>}
      {q.data && q.data.length > 0 && (
        <ul className="divide-y divide-app rounded-md border border-app">
          {q.data.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <Link to={`/templates/${t.id}`} className="font-medium text-app hover:underline">{t.name}</Link>
              <span className="text-xs text-app-muted"><code className="font-mono">{t.key}</code> · v{t.latestVersion} · {formatTime(t.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

function NewTemplate(): JSX.Element {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  return (
    <Page title="New template" back={{ to: '/templates', label: 'Templates' }}>
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Field label="Name"><TextInput value={name} onChange={setName} placeholder="Cart reminder" ariaLabel="Template name" /></Field>
        <Field label="Key" hint="what a journey step refers to"><TextInput value={key} onChange={setKey} placeholder="cart-reminder" ariaLabel="Template key" mono /></Field>
      </div>
      <ContentForm initial={{ subject: '', html: STARTER }} saveLabel="Save template" onSave={async (v) => {
        const r = await createTemplate({ key: key.trim(), name: name.trim(), ...v });
        await qc.invalidateQueries({ queryKey: ['engage', 'templates'] });
        navigate(`/templates/${r.template.id}`);
      }} />
    </Page>
  );
}

function Preview({ id, version }: { id: string; version: number }): JSX.Element {
  const [firstName, setFirstName] = useState('Ayşe');
  const run = useMutation<TemplatePreview>({ mutationFn: () => previewTemplate(id, { version, attributes: { first_name: firstName }, payload: { cart_id: 'cart-123' } }) });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48"><Field label="first_name"><TextInput value={firstName} onChange={setFirstName} ariaLabel="Preview first name" /></Field></div>
        <Button onClick={() => run.mutate()} disabled={run.isPending} testId={`preview-${version}`}>Preview v{version}</Button>
      </div>
      <ErrorLine error={run.error} />
      {run.data && (
        <div className="rounded-md border border-app">
          {run.data.errors.length > 0 && <Issues title="This version cannot be filled with these values" issues={run.data.errors.map((e) => ({ path: e.variable ?? e.code, message: e.message }))} />}
          {run.data.subject !== null && <p className="border-b border-app px-3 py-2 text-sm text-app"><span className="text-app-muted">Subject: </span>{run.data.subject}</p>}
          {run.data.html !== null && (
            // Sandboxed: no scripts, no same-origin access; the content is the tenant's own HTML rendered by the server.
            <iframe title={`Preview of version ${version}`} sandbox="" srcDoc={run.data.html} className="h-80 w-full bg-white" />
          )}
        </div>
      )}
    </div>
  );
}

function TemplateDetail({ id }: { id: string }): JSX.Element {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['engage', 'template', id], queryFn: () => getTemplate(id) });
  const [editing, setEditing] = useState(false);
  if (!q.data) return <Page title="Template" back={{ to: '/templates', label: 'Templates' }}>{q.error ? <ErrorLine error={q.error} /> : <p className="text-sm text-app-muted">Loading…</p>}</Page>;
  const { template, versions } = q.data;
  const latest = versions[0];
  return (
    <Page title={template.name} back={{ to: '/templates', label: 'Templates' }} actions={!editing && <Button onClick={() => setEditing(true)}>New version</Button>}>
      <p className="text-sm text-app-muted">Key <code className="font-mono">{template.key}</code>. Journeys use the latest version unless a step pins one.</p>
      {editing && latest && (
        <Card title={`New version (from v${latest.version})`}>
          <ContentForm initial={{ subject: latest.subject, html: latest.html ?? '' }} saveLabel="Save new version" onSave={async (v) => {
            await addTemplateVersion(id, v);
            setEditing(false);
            await qc.invalidateQueries({ queryKey: ['engage', 'template', id] });
          }} />
        </Card>
      )}
      {versions.map((v) => (
        <Card key={v.id} title={`Version ${v.version} · ${formatTime(v.createdAt)}`}>
          <p className="mb-2 text-sm text-app"><span className="text-app-muted">Subject: </span>{v.subject}</p>
          <Preview id={id} version={v.version} />
        </Card>
      ))}
    </Page>
  );
}

export function TemplatesView(): JSX.Element {
  const { pathname } = useLocation();
  if (pathname === '/templates/new') return <NewTemplate />;
  const detail = /^\/templates\/([^/]+)\/?$/.exec(pathname);
  if (detail) return <TemplateDetail key={detail[1]} id={decodeURIComponent(detail[1]!)} />;
  return <TemplateList />;
}

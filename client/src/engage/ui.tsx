import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Issue } from './builderApi';

/** Small shared pieces for the engage builder screens (WP-20), in the app's existing visual language. */

export const formatTime = (v: string | null | undefined): string => (v ? new Date(v).toLocaleString() : '—');

export function Page({ title, back, actions, children, testId }: { title: ReactNode; back?: { to: string; label: string }; actions?: ReactNode; children: ReactNode; testId?: string }): JSX.Element {
  return (
    <div className="flex-1 overflow-y-auto bg-app px-4 py-6 sm:px-8" data-testid={testId}>
      <div className="mx-auto max-w-5xl">
        {back && <Link to={back.to} className="text-sm text-app-muted hover:text-app">← {back.label}</Link>}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-app">{title}</h1>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function Button({ children, onClick, kind = 'secondary', disabled, type = 'button', testId }: {
  children: ReactNode; onClick?: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; type?: 'button' | 'submit'; testId?: string;
}): JSX.Element {
  const style = kind === 'primary' ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600'
    : kind === 'danger' ? 'border-red-500/60 text-red-600 hover:bg-red-500/10' : 'border-app text-app hover:bg-app-muted/10';
  return (
    <button type={type} onClick={onClick} disabled={disabled} data-testid={testId}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${style}`}>
      {children}
    </button>
  );
}

export function LinkButton({ to, children, kind = 'secondary' }: { to: string; children: ReactNode; kind?: 'primary' | 'secondary' }): JSX.Element {
  const style = kind === 'primary' ? 'bg-blue-600 text-white hover:bg-blue-700 border-blue-600' : 'border-app text-app hover:bg-app-muted/10';
  return <Link to={to} className={`rounded-md border px-3 py-1.5 text-sm font-medium ${style}`}>{children}</Link>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): JSX.Element {
  return (
    <label className="block text-sm">
      <span className="font-medium text-app">{label}</span>
      {hint && <span className="ml-2 text-xs text-app-muted">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

/** The app's theme-aware input styles (globals.css), so fields read in both light and dark themes. */
export const inputClass = 'input-theme text-sm';
export const selectClass = 'select-theme w-full text-sm';

export function TextInput(props: { value: string; onChange: (v: string) => void; placeholder?: string; ariaLabel?: string; testId?: string; mono?: boolean }): JSX.Element {
  return <input value={props.value} onChange={(e) => props.onChange(e.target.value)} placeholder={props.placeholder} aria-label={props.ariaLabel}
    data-testid={props.testId} className={`${inputClass} ${props.mono ? 'font-mono' : ''}`} />;
}

export function Select<T extends string>(props: { value: T; onChange: (v: T) => void; options: ReadonlyArray<{ value: T; label: string }>; ariaLabel?: string; testId?: string }): JSX.Element {
  return (
    <select value={props.value} onChange={(e) => props.onChange(e.target.value as T)} aria-label={props.ariaLabel} data-testid={props.testId} className={selectClass}>
      {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-700', approved: 'bg-blue-500/15 text-blue-700', draft: 'bg-app-muted/20 text-app-muted',
  retired: 'bg-app-muted/10 text-app-muted line-through', done: 'bg-emerald-500/15 text-emerald-700', running: 'bg-blue-500/15 text-blue-700',
  failed: 'bg-red-500/15 text-red-600',
};
export function StatusBadge({ status }: { status: string }): JSX.Element {
  return <span data-testid={`status-${status}`} className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? 'bg-app-muted/20 text-app-muted'}`}>{status}</span>;
}

export function Issues({ issues, title = 'Fix these before saving' }: { issues: Issue[]; title?: string }): JSX.Element | null {
  if (!issues.length) return null;
  return (
    <div role="alert" className="rounded-md border border-red-500/40 bg-red-500/5 p-3 text-sm" data-testid="issues">
      <p className="font-medium text-red-600">{title}</p>
      <ul className="mt-1 list-disc pl-5 text-app">
        {issues.map((i, k) => <li key={k}><code className="text-xs text-app-muted">{i.path}</code> {i.message}</li>)}
      </ul>
    </div>
  );
}

export function ErrorLine({ error }: { error: unknown }): JSX.Element | null {
  if (!error) return null;
  const status = (error as { status?: number }).status;
  const text = status === 403 ? 'Only a tenant admin can do this.' : status === 404 ? 'Not found.' : (error as Error).message || 'Something went wrong. Try again.';
  return <p role="alert" className="text-sm text-red-600">{text}</p>;
}

export function Empty({ children }: { children: ReactNode }): JSX.Element {
  return <p className="mt-6 text-sm text-app-muted">{children}</p>;
}

/** Section within a page. */
export function Card({ title, children, actions }: { title?: string; children: ReactNode; actions?: ReactNode }): JSX.Element {
  return (
    <section className="mt-4 rounded-md border border-app p-4">
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-app-muted">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

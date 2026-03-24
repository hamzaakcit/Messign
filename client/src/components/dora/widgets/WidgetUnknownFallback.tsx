import { useState } from 'react';

export function UnknownWidgetFallback({
  title,
  widgetType,
  raw,
}: {
  title: string;
  widgetType: string;
  raw: unknown;
}) {
  const [open, setOpen] = useState(false);
  let preview = '';
  try {
    preview = JSON.stringify(raw, null, 2);
  } catch {
    preview = String(raw);
  }
  const truncated = preview.length > 2000 ? `${preview.slice(0, 2000)}…` : preview;

  return (
    <div
      className="dora-glass dora-fade-up"
      style={{
        marginTop: 12,
        padding: '14px 16px',
        borderRadius: 'var(--dora-r-widget, 16px)',
        fontSize: 12,
      }}
      role="status"
    >
      <p className="m-0 dora-font" style={{ color: 'var(--dora-text-2, #cbd5e1)' }}>
        Unsupported widget type{' '}
        <code
          className="rounded bg-app-surface-tertiary px-1 py-0.5 text-[11px]"
          style={{ color: 'var(--dora-text-1, #f1f5f9)' }}
        >
          {widgetType}
        </code>
        {title ? ` — ${title}` : ''}.
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-xs font-medium underline-offset-2 hover:underline dora-font dora-focus-ring rounded px-0.5 -mx-0.5"
        style={{ color: 'var(--dora-text-2, #cbd5e1)' }}
        aria-expanded={open}
      >
        {open ? 'Hide' : 'Show'} payload
      </button>
      {open && (
        <pre
          className="mt-2 max-h-48 overflow-auto rounded-lg border border-app-border p-2 text-[10px] leading-relaxed dora-mono"
          style={{ color: 'var(--dora-text-2, #cbd5e1)' }}
        >
          {truncated}
        </pre>
      )}
    </div>
  );
}

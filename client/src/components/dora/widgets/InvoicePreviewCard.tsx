import { useState } from 'react';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { DoraWidgetShell } from './DoraWidgetShell';
import type { InvoicePreviewData } from '@/types/knowledge-hub/ai';
import type { DoraBlockProps } from '@/types/dora/dynamic-blocks';

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'rgba(148, 163, 184, 0.2)', text: 'var(--dora-text-2, #cbd5e1)' },
  sent: { bg: 'rgba(59, 130, 246, 0.2)', text: '#93c5fd' },
  paid: { bg: 'rgba(34, 197, 94, 0.2)', text: '#86efac' },
  finalized: { bg: 'rgba(34, 197, 94, 0.2)', text: '#86efac' },
  signed: { bg: 'rgba(34, 197, 94, 0.2)', text: '#86efac' },
  overdue: { bg: 'rgba(239, 68, 68, 0.2)', text: '#fca5a5' },
  pending: { bg: 'rgba(245, 158, 11, 0.2)', text: '#fcd34d' },
  cancelled: { bg: 'rgba(100, 116, 139, 0.25)', text: 'var(--dora-text-2, #cbd5e1)' },
  void: { bg: 'rgba(100, 116, 139, 0.25)', text: 'var(--dora-text-2, #cbd5e1)' },
};

function statusBadge(status: string) {
  const key = status.toLowerCase();
  const s = STATUS_STYLES[key] ?? STATUS_STYLES.draft;
  return (
    <span
      className="rounded-md px-2 py-0.5 text-[11px] font-medium capitalize"
      style={{ background: s.bg, color: s.text }}
    >
      {status}
    </span>
  );
}

export interface InvoicePreviewCardProps {
  block: DoraBlockProps<InvoicePreviewData>;
  delay?: number;
}

export function InvoicePreviewCard({ block, delay = 0 }: InvoicePreviewCardProps) {
  const { data, host } = block;

  const handleView = () => {
    host.dispatch({ kind: 'navigate', to: '/finance', state: { financeView: 'invoices' } });
  };
  const [linesOpen, setLinesOpen] = useState(false);
  const hasLines = data.lineItems && data.lineItems.length > 0;

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: data.currency || 'USD' }).format(n);

  return (
    <DoraWidgetShell
      title={data.invoiceNumber ? `Invoice ${data.invoiceNumber}` : 'Invoice'}
      icon={<FileText size={16} className="text-sky-400 opacity-90" aria-hidden />}
      subtitle={data.clientName}
      delay={delay}
      accentGradient="linear-gradient(90deg, #22c55e, #38bdf8)"
      actions={
        <button
          type="button"
          onClick={handleView}
          className="rounded-lg border px-3 py-1 text-xs font-medium transition-colors dora-focus-ring"
          style={{
            borderColor: 'rgba(56, 189, 248, 0.35)',
            color: 'var(--dora-text-2, #cbd5e1)',
            background: 'rgba(15, 23, 42, 0.6)',
          }}
        >
          Open Finance
        </button>
      }
    >
      <div className="dora-font space-y-3" role="region" aria-label="Invoice preview">
        <div className="flex flex-wrap items-center gap-2">
          {statusBadge(data.status)}
          <span className="text-lg font-semibold" style={{ color: 'var(--dora-text-1, #f1f5f9)' }}>
            {fmtMoney(data.amount)}
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--dora-text-2, #cbd5e1)' }}>
          <dt className="dora-chat-text-tertiary">Issued</dt>
          <dd>{data.issueDate || '—'}</dd>
          <dt className="dora-chat-text-tertiary">Due</dt>
          <dd>{data.dueDate ?? '—'}</dd>
        </dl>
        {hasLines && (
          <div>
            <button
              type="button"
              onClick={() => setLinesOpen((o) => !o)}
              className="flex items-center gap-1 text-xs font-medium dora-focus-ring rounded"
              style={{ color: 'var(--dora-text-2, #cbd5e1)' }}
              aria-expanded={linesOpen}
            >
              {linesOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Line items ({data.lineItems!.length})
            </button>
            {linesOpen && (
              <ul className="mt-2 space-y-1 rounded-lg border border-app-border p-2 text-xs" role="list">
                {data.lineItems!.map((line, i) => (
                  <li key={i} className="flex justify-between gap-2" style={{ color: 'var(--dora-text-2, #cbd5e1)' }}>
                    <span className="truncate">{line.description}</span>
                    <span className="shrink-0">{fmtMoney(line.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </DoraWidgetShell>
  );
}

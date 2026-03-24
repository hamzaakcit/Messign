import { useMemo } from 'react';
import { Table2, Download } from 'lucide-react';
import { DoraWidgetShell } from './DoraWidgetShell';

const SKIP_KEYS = new Set(['__proto__', 'constructor']);

function rowsFromData(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((r) => r && typeof r === 'object' && !Array.isArray(r)) as Record<string, unknown>[];
  }
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    for (const v of Object.values(o)) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && !Array.isArray(v[0])) {
        return v as Record<string, unknown>[];
      }
    }
    return [o];
  }
  return [];
}

function formatCell(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 80);
  return String(v);
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const header = columns.map(esc).join(',');
  const lines = rows.map((row) => columns.map((c) => esc(formatCell(row[c]))).join(','));
  return [header, ...lines].join('\n');
}

export default function DataTableWidget({
  data,
  title = 'Data',
  delay = 0,
}: {
  data: unknown;
  title?: string;
  delay?: number;
}) {
  const rows = useMemo(() => rowsFromData(data), [data]);

  const columns = useMemo(() => {
    if (rows.length === 0) return [];
    const keys = new Set<string>();
    for (const row of rows.slice(0, 30)) {
      for (const k of Object.keys(row)) {
        if (!SKIP_KEYS.has(k) && !k.startsWith('_')) keys.add(k);
      }
    }
    return Array.from(keys).slice(0, 12);
  }, [rows]);

  const exportCsv = () => {
    if (rows.length === 0 || columns.length === 0) return;
    const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dora-export-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (rows.length === 0) {
    return (
      <DoraWidgetShell
        title={title}
        icon={<Table2 size={14} className="text-violet-400" />}
        subtitle="No tabular rows in this result"
        delay={delay}
      >
        <p className="text-sm text-app-text/45">The tool returned data in a shape we couldn&apos;t tabulate. See the text summary above.</p>
      </DoraWidgetShell>
    );
  }

  const displayRows = rows.slice(0, 40);

  return (
    <DoraWidgetShell
      title={title}
      icon={<Table2 size={14} className="text-violet-400" />}
      subtitle={`${displayRows.length} row${displayRows.length === 1 ? '' : 's'}`}
      delay={delay}
      actions={
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-1 rounded-lg border border-app-border bg-app-surface-tertiary px-2 py-1 text-[11px] text-app-text/70 hover:bg-app-hover hover:text-app-text"
        >
          <Download size={12} />
          CSV
        </button>
      }
    >
      <div className="overflow-x-auto rounded-lg border border-app-border max-h-[320px] overflow-y-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 bg-slate-900/95 z-[1]">
            <tr className="border-b border-app-border text-app-text/45">
              {columns.map((c) => (
                <th key={c} className="py-2 px-2 font-medium whitespace-nowrap">
                  {c.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, ri) => (
              <tr key={ri} className="border-b border-app-border text-app-text/75">
                {columns.map((c) => (
                  <td key={c} className="py-1.5 px-2 max-w-[200px] truncate" title={formatCell(row[c])}>
                    {formatCell(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DoraWidgetShell>
  );
}

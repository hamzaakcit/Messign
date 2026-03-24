import type { AITablePayload } from '@/types/knowledge-hub/ai';

interface AITableRendererProps {
  table: AITablePayload;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '\u2014';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return value;
    }
  }
  return String(value);
}

export function AITableRenderer({ table }: AITableRendererProps) {
  const { title, columns, rows } = table;

  if (!rows || rows.length === 0) return null;

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-app-border">
      {title && (
        <div className="px-4 py-2.5 bg-app-card/50 border-b border-app-border">
          <h4 className="text-sm font-semibold text-app-muted">{title}</h4>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-app-card/30">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-2.5 text-xs font-semibold dora-chat-text-tertiary uppercase tracking-wider whitespace-nowrap
                    ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-600">
            {rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className="hover:bg-app-hover/30 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2.5 text-app-muted whitespace-nowrap
                      ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                  >
                    {formatCellValue(row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 10 && (
        <div className="px-4 py-2 text-xs dora-chat-text-tertiary border-t border-app-border">
          Showing {rows.length} rows
        </div>
      )}
    </div>
  );
}

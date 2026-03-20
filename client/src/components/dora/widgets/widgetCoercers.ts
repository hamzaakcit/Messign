import type { InvoicePreviewData, LeaderboardData, LeaderboardEntry } from '@/types/knowledge-hub/ai';

export function coerceInvoicePreviewData(raw: unknown): InvoicePreviewData | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = o.invoiceId ?? o.id;
  const num = o.invoiceNumber;
  if ((id == null || id === '') && (num == null || num === '')) return null;
  const amount = typeof o.amount === 'number' ? o.amount : parseFloat(String(o.amount ?? 0)) || 0;
  return {
    invoiceId: String(id ?? num ?? ''),
    invoiceNumber: String(num ?? id ?? ''),
    clientName: String(o.clientName ?? o.to_name ?? 'Unknown'),
    status: String(o.status ?? 'draft'),
    currency: String(o.currency ?? 'USD'),
    amount,
    issueDate: typeof o.issueDate === 'string' ? o.issueDate : String(o.created_at ?? '').slice(0, 10),
    dueDate:
      o.dueDate === null
        ? null
        : typeof o.dueDate === 'string'
          ? o.dueDate
          : o.due_date
            ? String(o.due_date).slice(0, 10)
            : null,
    lineItems: Array.isArray(o.lineItems)
      ? (o.lineItems as InvoicePreviewData['lineItems'])
      : undefined,
  };
}

export function coerceLeaderboardData(raw: unknown, fallbackTitle: string): LeaderboardData | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.entries)) return null;
  const entries = (o.entries as unknown[]).map((row, i): LeaderboardEntry => {
    if (!row || typeof row !== 'object') {
      return { rank: i + 1, name: 'Unknown', value: '—' };
    }
    const r = row as Record<string, unknown>;
    return {
      rank: typeof r.rank === 'number' ? r.rank : Number(r.rank ?? i + 1),
      userId: r.userId != null ? String(r.userId) : r.user_id != null ? String(r.user_id) : undefined,
      name: String(r.name ?? r.full_name ?? 'Unknown'),
      subtitle: r.subtitle != null ? String(r.subtitle) : r.email != null ? String(r.email) : undefined,
      value:
        typeof r.value === 'number' || typeof r.value === 'string'
          ? (r.value as number | string)
          : Number(r.points ?? 0),
      trend: r.trend === 'up' || r.trend === 'down' || r.trend === 'flat' ? r.trend : undefined,
    };
  });
  return {
    title: typeof o.title === 'string' ? o.title : fallbackTitle,
    metricLabel: String(o.metricLabel ?? 'Points'),
    entries,
    maxRows: typeof o.maxRows === 'number' ? o.maxRows : 10,
    emptyMessage: typeof o.emptyMessage === 'string' ? o.emptyMessage : undefined,
    variant: o.variant === 'compact' || o.variant === 'full' ? o.variant : undefined,
  };
}

/**
 * Maps tool observations to one or more generative UI widget payloads.
 * Handles dynamic types (e.g. single invoice → card, many → table).
 */

import { randomUUID } from 'node:crypto';
import { sanitizeData } from './dataSanitizer.js';
import { AI_WIDGET_TOOL_MAP } from './widgetToolMap.js';

export type WidgetBlockAction =
  | { id: string; label: string; kind: 'navigate'; to: string; state?: unknown }
  | { id: string; label: string; kind: 'send_message'; text: string; intentId?: string };

export type WidgetPayload = {
  schemaVersion: number;
  id: string;
  widgetType: string;
  data: unknown;
  title: string;
  actions?: WidgetBlockAction[];
};

function widgetPayload(
  widgetType: string,
  data: unknown,
  title: string,
  actions?: WidgetBlockAction[],
): WidgetPayload {
  const p: WidgetPayload = {
    schemaVersion: 1,
    id: randomUUID(),
    widgetType,
    data,
    title,
  };
  if (actions?.length) p.actions = actions;
  return p;
}

function extractShortTitle(fallback: string, summary?: string): string {
  if (!summary) return fallback;
  const line = summary.split('\n')[0]?.replace(/\*\*/g, '').trim() || '';
  if (!line) return fallback;
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

function isoDatePart(value: unknown): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function normalizeInvoiceRow(row: Record<string, unknown>): Record<string, unknown> {
  const amount = parseFloat(String(row.grand_total ?? row.total_expenses ?? row.amount ?? 0));
  const issueRaw = row.created_at ?? row.issue_date ?? row.issueDate;
  const dueRaw = row.due_date ?? row.dueDate;
  return {
    invoiceId: String(row.id ?? row.invoice_number ?? ''),
    invoiceNumber: String(row.invoice_number ?? row.id ?? ''),
    clientName: String(row.employee_name ?? row.to_name ?? row.client_name ?? 'Unknown'),
    status: String(row.status ?? 'draft'),
    currency: String(row.currency ?? 'USD'),
    amount: Number.isFinite(amount) ? amount : 0,
    issueDate: isoDatePart(issueRaw),
    dueDate: dueRaw == null || dueRaw === '' ? null : isoDatePart(dueRaw),
    lineItems: Array.isArray(row.line_items)
      ? row.line_items
      : Array.isArray(row.lineItems)
        ? row.lineItems
        : undefined,
  };
}

function looksLikeLeaderboardRow(row: unknown): boolean {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  const hasPoints = r.points != null || r.xp != null;
  const hasName = r.full_name != null || r.name != null;
  return hasPoints && hasName;
}

/**
 * Build widget payload(s) for a single tool result. Returns empty array when no widget should render.
 */
export function resolveWidgetPayloadsForTool(
  toolName: string,
  obs: { success: boolean; data: unknown; summary?: string },
  userRole: string,
): WidgetPayload[] {
  if (!obs.success || obs.data == null) return [];

  const isAdmin = userRole === 'admin';
  const sanitized = sanitizeData(obs.data, isAdmin);

  if (toolName === 'finance:get_invoice_details') {
    if (!Array.isArray(sanitized)) return [];
    if (sanitized.length === 0) return [];
    if (sanitized.length === 1) {
      const row = sanitized[0] as Record<string, unknown>;
      return [
        widgetPayload('invoice_preview', normalizeInvoiceRow(row), extractShortTitle('Invoice', obs.summary)),
      ];
    }
    return [
      widgetPayload('data_table', sanitized, extractShortTitle('Invoices', obs.summary)),
    ];
  }

  if (toolName === 'achievements:get_achievements_leaderboard') {
    if (Array.isArray(sanitized) && sanitized.length > 0 && looksLikeLeaderboardRow(sanitized[0])) {
      const rows = sanitized as Record<string, unknown>[];
      const entries = rows.map((r, i) => ({
        rank: typeof r.rank === 'number' ? r.rank : Number(r.rank ?? i + 1),
        userId:
          r.user_id != null
            ? String(r.user_id)
            : r.userId != null
              ? String(r.userId)
              : undefined,
        name: String(r.full_name ?? r.name ?? 'Unknown'),
        subtitle: r.email != null ? String(r.email) : undefined,
        value: Number(r.points ?? r.xp ?? 0),
      }));
      return [
        widgetPayload(
          'leaderboard_list',
          {
            title: 'Leaderboard',
            metricLabel: 'Points',
            entries,
            maxRows: 25,
          },
          extractShortTitle('Leaderboard', obs.summary),
          [
            {
              id: 'top-performers',
              label: 'Top performers',
              kind: 'send_message',
              text: 'Who are the top performers this month?',
              intentId: 'dashboard.top_performers',
            },
          ],
        ),
      ];
    }
    const fallback = AI_WIDGET_TOOL_MAP[toolName];
    if (!fallback) return [];
    return [widgetPayload(fallback, sanitized, obs.summary ?? '')];
  }

  const widgetType = AI_WIDGET_TOOL_MAP[toolName];
  if (!widgetType) return [];
  return [widgetPayload(widgetType, sanitized, obs.summary ?? '')];
}

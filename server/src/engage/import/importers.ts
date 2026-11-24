import type { PoolClient } from 'pg';
import { normalizeEmail, normalizePhone, type ConsentChannel } from '../profiles.js';
import { CsvError, type CsvTable } from './csv.js';

/**
 * CSV import (WP-09). Rows are validated one by one (a bad row never stops the file), then written in chunks with a few
 * set-based statements instead of one round trip per row, which is what makes 100k profiles practical.
 * Reports carry line numbers, column names and codes, never the cell values (they can be personal data).
 */

export const CHUNK_SIZE = 500;
export const MAX_REPORTED_ERRORS = 200;
const MAX_AGE_MS = 399 * 24 * 3600_000;
const FUTURE_SKEW_MS = 5 * 60_000;

export interface RowError { line: number; field: string; code: string; message: string }

export interface ImportCounts {
  rows: number;
  created: number;
  updated: number;
  merged_duplicates: number;
  rows_rejected: number;
  identifiers_skipped: number;
  consents_recorded: number;
  consents_unchanged: number;
  consents_skipped: number;
  events_created: number;
  events_already_imported: number;
}

export const emptyCounts = (): ImportCounts => ({
  rows: 0, created: 0, updated: 0, merged_duplicates: 0, rows_rejected: 0, identifiers_skipped: 0,
  consents_recorded: 0, consents_unchanged: 0, consents_skipped: 0, events_created: 0, events_already_imported: 0,
});

export class ErrorSink {
  readonly errors: RowError[] = [];
  total = 0;
  add(line: number, field: string, code: string, message: string): void {
    this.total++;
    if (this.errors.length < MAX_REPORTED_ERRORS) this.errors.push({ line, field, code, message });
  }
  get truncated(): boolean { return this.total > this.errors.length; }
}

const CONSENT_CHANNELS: ConsentChannel[] = ['email', 'sms', 'whatsapp', 'call'];
const RESERVED_PROFILE_COLUMNS = new Set([
  'external_id', 'email', 'phone', 'locale', 'timezone',
  ...CONSENT_CHANNELS.map((c) => `consent_${c}`), 'consent_recorded_at', 'consent_evidence_ref', 'consent_ip',
]);
const ATTRIBUTE_NAME = /^[a-z][a-z0-9_]{0,39}$/;

const GRANT = new Set(['granted', 'grant', 'yes', 'true', '1', 'evet', 'y']);
const REVOKE = new Set(['revoked', 'revoke', 'no', 'false', '0', 'hayir', 'hayır', 'n']);

function indexOfColumns(table: CsvTable): Map<string, number> {
  return new Map(table.headers.map((h, i) => [h, i]));
}

function requireColumns(table: CsvTable, needed: string[]): void {
  const missing = needed.filter((c) => !table.headers.includes(c));
  if (missing.length) throw new CsvError(`Missing required column(s): ${missing.join(', ')}`);
}

export interface ProfileRow {
  line: number;
  externalId: string;
  email?: string;
  phone?: string;
  locale?: string;
  timezone?: string;
  attributes: Record<string, string>;
  consents: Map<ConsentChannel, { status: 'granted' | 'revoked'; recordedAt: Date; evidence: Record<string, string> }>;
}

function parseWhen(raw: string): Date | null {
  const t = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(t)) return null;
  const d = new Date(t.length === 10 ? `${t}T00:00:00Z` : t.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseProfileRows(table: CsvTable, sink: ErrorSink): ProfileRow[] {
  requireColumns(table, ['external_id']);
  const col = indexOfColumns(table);
  const get = (cells: string[], name: string): string => (col.has(name) ? (cells[col.get(name)!] ?? '').trim() : '');
  const attributeColumns = table.headers.filter((h) => !RESERVED_PROFILE_COLUMNS.has(h));
  for (const h of attributeColumns) {
    if (!ATTRIBUTE_NAME.test(h)) throw new CsvError(`Column "${h.slice(0, 40)}" cannot be an attribute name (lower_snake_case, up to 40 characters)`);
  }
  const out: ProfileRow[] = [];
  const now = Date.now();
  for (const { line, cells } of table.rows) {
    if (cells.length > table.headers.length) { sink.add(line, '(row)', 'too_many_cells', 'The row has more cells than the header'); continue; }
    const externalId = get(cells, 'external_id');
    if (!externalId || externalId.length > 200) { sink.add(line, 'external_id', 'invalid_external_id', 'external_id is required (up to 200 characters)'); continue; }
    const row: ProfileRow = { line, externalId, attributes: {}, consents: new Map() };

    const emailRaw = get(cells, 'email');
    if (emailRaw) {
      const e = normalizeEmail(emailRaw);
      if (e) row.email = e; else { sink.add(line, 'email', 'invalid_email', 'Not a valid email address; the profile was imported without it'); }
    }
    const phoneRaw = get(cells, 'phone');
    if (phoneRaw) {
      const p = normalizePhone(phoneRaw);
      if (p) row.phone = p; else { sink.add(line, 'phone', 'invalid_phone', 'Not a valid phone number; the profile was imported without it'); }
    }
    const locale = get(cells, 'locale'); if (locale) row.locale = locale.slice(0, 35);
    const tz = get(cells, 'timezone'); if (tz) row.timezone = tz.slice(0, 64);

    let size = 0;
    for (const h of attributeColumns) {
      const v = get(cells, h);
      if (!v) continue;
      if (v.length > 500) { sink.add(line, h, 'attribute_too_long', 'Attribute value is longer than 500 characters; skipped'); continue; }
      size += h.length + v.length;
      if (size > 30_000) { sink.add(line, h, 'attributes_too_large', 'Attributes for this row are too large; the rest were skipped'); break; }
      row.attributes[h] = v;
    }

    const recordedRaw = get(cells, 'consent_recorded_at');
    const evidenceRef = get(cells, 'consent_evidence_ref');
    const ip = get(cells, 'consent_ip');
    for (const channel of CONSENT_CHANNELS) {
      const field = `consent_${channel}`;
      const raw = get(cells, field).toLowerCase();
      if (!raw) continue;
      if (GRANT.has(raw)) {
        const when = recordedRaw ? parseWhen(recordedRaw) : null;
        if (!evidenceRef || !when) {
          sink.add(line, field, 'consent_evidence_missing', 'A grant needs consent_recorded_at (YYYY-MM-DD or ISO) and consent_evidence_ref; consent skipped');
          continue;
        }
        if (when.getTime() > now + FUTURE_SKEW_MS) { sink.add(line, 'consent_recorded_at', 'consent_in_future', 'consent_recorded_at is in the future; consent skipped'); continue; }
        row.consents.set(channel, { status: 'granted', recordedAt: when, evidence: { evidence_ref: evidenceRef.slice(0, 300), ...(ip ? { ip: ip.slice(0, 64) } : {}), recorded_at: when.toISOString() } });
      } else if (REVOKE.has(raw)) {
        const when = recordedRaw ? parseWhen(recordedRaw) : null;
        row.consents.set(channel, { status: 'revoked', recordedAt: when && when.getTime() <= now ? when : new Date(), evidence: evidenceRef ? { evidence_ref: evidenceRef.slice(0, 300) } : {} });
      } else {
        sink.add(line, field, 'invalid_consent_value', 'Use granted or revoked (also yes/no, evet/hayır, 1/0); consent skipped');
      }
    }
    out.push(row);
  }
  return out;
}

/** Same customer twice in one chunk: later non-empty values win, consents per channel are replaced. */
function mergeChunk(rows: ProfileRow[], counts: ImportCounts): ProfileRow[] {
  const byId = new Map<string, ProfileRow>();
  for (const r of rows) {
    const prev = byId.get(r.externalId);
    if (!prev) { byId.set(r.externalId, { ...r, attributes: { ...r.attributes }, consents: new Map(r.consents) }); continue; }
    counts.merged_duplicates++;
    prev.line = r.line;
    if (r.email) prev.email = r.email;
    if (r.phone) prev.phone = r.phone;
    if (r.locale) prev.locale = r.locale;
    if (r.timezone) prev.timezone = r.timezone;
    Object.assign(prev.attributes, r.attributes);
    for (const [ch, c] of r.consents) prev.consents.set(ch, c);
  }
  return [...byId.values()];
}

/** Writes one chunk of profiles inside the caller's tenant transaction. */
export async function writeProfileChunk(c: PoolClient, orgId: string, chunk: ProfileRow[], counts: ImportCounts, sink: ErrorSink): Promise<void> {
  const rows = mergeChunk(chunk, counts);
  if (rows.length === 0) return;

  const up = await c.query<{ id: string; external_id: string; inserted: boolean }>(
    `INSERT INTO engage.profiles (organization_id, external_id, attributes, locale, timezone)
     SELECT $1, t.external_id, t.attrs::jsonb, NULLIF(t.locale, ''), NULLIF(t.tz, '')
       FROM unnest($2::text[], $3::text[], $4::text[], $5::text[]) AS t(external_id, attrs, locale, tz)
     ON CONFLICT (organization_id, external_id) DO UPDATE SET
       attributes = engage.profiles.attributes || EXCLUDED.attributes,
       locale = COALESCE(EXCLUDED.locale, engage.profiles.locale),
       timezone = COALESCE(EXCLUDED.timezone, engage.profiles.timezone),
       updated_at = now()
     WHERE engage.profiles.erased_at IS NULL
     RETURNING id, external_id, (xmax = 0) AS inserted`,
    [orgId, rows.map((r) => r.externalId), rows.map((r) => JSON.stringify(r.attributes)), rows.map((r) => r.locale ?? ''), rows.map((r) => r.timezone ?? '')]);
  const idByExternal = new Map(up.rows.map((r) => [r.external_id, r.id]));
  const live: Array<{ row: ProfileRow; id: string }> = [];
  for (const r of rows) {
    const id = idByExternal.get(r.externalId);
    if (!id) { sink.add(r.line, 'external_id', 'profile_erased', 'This profile was erased and cannot be imported into'); counts.rows_rejected++; continue; }
    live.push({ row: r, id });
  }
  for (const r of up.rows) if (r.inserted) counts.created++; else counts.updated++;
  if (live.length === 0) return;
  const profileIds = live.map((x) => x.id);

  await c.query(
    `INSERT INTO engage.identifiers (organization_id, profile_id, type, value_normalized)
     SELECT $1, t.profile_id, 'external', t.value FROM unnest($2::uuid[], $3::text[]) AS t(profile_id, value) ON CONFLICT DO NOTHING`,
    [orgId, profileIds, live.map((x) => x.row.externalId)]);

  await writeIdentifiers(c, orgId, live, sink, counts);
  await writeConsents(c, orgId, live, sink, counts);
}

async function writeIdentifiers(c: PoolClient, orgId: string, live: Array<{ row: ProfileRow; id: string }>, sink: ErrorSink, counts: ImportCounts): Promise<void> {
  const claims = live.flatMap(({ row, id }) => [
    ...(row.email ? [{ id, line: row.line, type: 'email' as const, value: row.email }] : []),
    ...(row.phone ? [{ id, line: row.line, type: 'phone' as const, value: row.phone }] : []),
  ]);
  if (claims.length === 0) return;
  const cur = await c.query<{ profile_id: string; type: string; value_normalized: string }>(
    `SELECT profile_id, type, value_normalized FROM engage.identifiers
      WHERE organization_id = $1 AND is_active AND type IN ('email', 'phone') AND profile_id = ANY($2::uuid[])`,
    [orgId, live.map((x) => x.id)]);
  const current = new Map(cur.rows.map((r) => [`${r.profile_id}|${r.type}`, r.value_normalized]));
  const own = await c.query<{ profile_id: string; type: string; value_normalized: string }>(
    `SELECT i.profile_id, i.type, i.value_normalized FROM engage.identifiers i
       JOIN unnest($2::text[], $3::text[]) AS t(type, value) ON t.type = i.type AND t.value = i.value_normalized
      WHERE i.organization_id = $1 AND i.is_active`,
    [orgId, claims.map((x) => x.type), claims.map((x) => x.value)]);
  const owner = new Map(own.rows.map((r) => [`${r.type}|${r.value_normalized}`, r.profile_id]));

  const deactivate: Array<{ id: string; type: string }> = [];
  const insert: Array<{ id: string; type: string; value: string }> = [];
  for (const cl of claims) {
    const have = current.get(`${cl.id}|${cl.type}`);
    if (have === cl.value) continue;
    const holder = owner.get(`${cl.type}|${cl.value}`);
    if (holder && holder !== cl.id) {
      sink.add(cl.line, cl.type, 'identifier_conflict', `This ${cl.type} already belongs to another profile; the profile was imported without it`);
      counts.identifiers_skipped++;
      continue;
    }
    if (have !== undefined) { deactivate.push({ id: cl.id, type: cl.type }); owner.delete(`${cl.type}|${have}`); }
    insert.push({ id: cl.id, type: cl.type, value: cl.value });
    owner.set(`${cl.type}|${cl.value}`, cl.id);
  }
  if (deactivate.length) {
    await c.query(
      `UPDATE engage.identifiers i SET is_active = false, deactivated_at = now()
         FROM unnest($2::uuid[], $3::text[]) AS t(profile_id, type)
        WHERE i.organization_id = $1 AND i.is_active AND i.profile_id = t.profile_id AND i.type = t.type`,
      [orgId, deactivate.map((x) => x.id), deactivate.map((x) => x.type)]);
  }
  if (insert.length) {
    await c.query(
      `INSERT INTO engage.identifiers (organization_id, profile_id, type, value_normalized)
       SELECT $1, t.profile_id, t.type, t.value FROM unnest($2::uuid[], $3::text[], $4::text[]) AS t(profile_id, type, value)`,
      [orgId, insert.map((x) => x.id), insert.map((x) => x.type), insert.map((x) => x.value)]);
  }
}

async function writeConsents(c: PoolClient, orgId: string, live: Array<{ row: ProfileRow; id: string }>, sink: ErrorSink, counts: ImportCounts): Promise<void> {
  void sink;
  const wanted = live.flatMap(({ row, id }) => [...row.consents].map(([channel, v]) => ({ id, channel, ...v })));
  if (wanted.length === 0) return;
  const st = await c.query<{ profile_id: string; channel: string; status: string }>(
    `SELECT profile_id, channel, status FROM engage.consent_state WHERE organization_id = $1 AND purpose = 'marketing' AND profile_id = ANY($2::uuid[])`,
    [orgId, live.map((x) => x.id)]);
  const state = new Map(st.rows.map((r) => [`${r.profile_id}|${r.channel}`, r.status]));
  // Re-running the same file must not pile up ledger rows: only a change of decision is appended.
  const todo = wanted.filter((w) => state.get(`${w.id}|${w.channel}`) !== w.status);
  counts.consents_unchanged += wanted.length - todo.length;
  if (todo.length === 0) return;
  await c.query(
    `INSERT INTO engage.consents (organization_id, profile_id, channel, status, source, evidence, recorded_at)
     SELECT $1, t.profile_id, t.channel, t.status, 'import', t.evidence::jsonb, t.recorded_at
       FROM unnest($2::uuid[], $3::text[], $4::text[], $5::text[], $6::timestamptz[]) AS t(profile_id, channel, status, evidence, recorded_at)`,
    [orgId, todo.map((x) => x.id), todo.map((x) => x.channel), todo.map((x) => x.status), todo.map((x) => JSON.stringify(x.evidence)), todo.map((x) => x.recordedAt.toISOString())]);
  counts.consents_recorded += todo.length;
}

// ---------------------------------------------------------------------------------------------------- orders

export interface OrderRow { line: number; orderId: string; externalId: string; orderedAt: Date; total: number; currency: string; productIds: string[] }

export function parseOrderRows(table: CsvTable, sink: ErrorSink): OrderRow[] {
  requireColumns(table, ['order_id', 'external_id', 'ordered_at', 'total']);
  const col = indexOfColumns(table);
  const get = (cells: string[], name: string): string => (col.has(name) ? (cells[col.get(name)!] ?? '').trim() : '');
  const out: OrderRow[] = [];
  const now = Date.now();
  for (const { line, cells } of table.rows) {
    if (cells.length > table.headers.length) { sink.add(line, '(row)', 'too_many_cells', 'The row has more cells than the header'); continue; }
    const orderId = get(cells, 'order_id');
    const externalId = get(cells, 'external_id');
    if (!orderId || orderId.length > 150) { sink.add(line, 'order_id', 'invalid_order_id', 'order_id is required (up to 150 characters)'); continue; }
    if (!externalId || externalId.length > 200) { sink.add(line, 'external_id', 'invalid_external_id', 'external_id is required (up to 200 characters)'); continue; }
    const at = parseWhen(get(cells, 'ordered_at'));
    if (!at) { sink.add(line, 'ordered_at', 'invalid_date', 'ordered_at must be YYYY-MM-DD or an ISO timestamp'); continue; }
    if (at.getTime() > now + FUTURE_SKEW_MS) { sink.add(line, 'ordered_at', 'date_in_future', 'ordered_at is in the future'); continue; }
    if (at.getTime() < now - MAX_AGE_MS) { sink.add(line, 'ordered_at', 'date_too_old', 'Older than the 13-month event window; not imported'); continue; }
    const totalRaw = get(cells, 'total').replace(',', '.');
    const total = Number(totalRaw);
    if (!/^\d+(\.\d{1,2})?$/.test(totalRaw) || !Number.isFinite(total)) { sink.add(line, 'total', 'invalid_total', 'total must be a non-negative amount such as 129.90'); continue; }
    const currency = (get(cells, 'currency') || 'TRY').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) { sink.add(line, 'currency', 'invalid_currency', 'currency must be a 3-letter code'); continue; }
    const productIds = get(cells, 'product_ids').split('|').map((s) => s.trim()).filter(Boolean).slice(0, 50);
    out.push({ line, orderId, externalId, orderedAt: at, total, currency, productIds });
  }
  return out;
}

/** Historical orders become `order_completed` events. No trigger-outbox rows: back-filled history must not start journeys. */
export async function writeOrderChunk(c: PoolClient, orgId: string, chunk: OrderRow[], counts: ImportCounts, sink: ErrorSink): Promise<void> {
  if (chunk.length === 0) return;
  const profiles = await c.query<{ id: string; external_id: string }>(
    `SELECT id, external_id FROM engage.profiles WHERE organization_id = $1 AND erased_at IS NULL AND external_id = ANY($2::text[])`,
    [orgId, [...new Set(chunk.map((r) => r.externalId))]]);
  const idByExternal = new Map(profiles.rows.map((r) => [r.external_id, r.id]));
  const good: Array<OrderRow & { profileId: string }> = [];
  for (const r of chunk) {
    const profileId = idByExternal.get(r.externalId);
    if (!profileId) { sink.add(r.line, 'external_id', 'unknown_profile', 'No such profile (import profiles first)'); counts.rows_rejected++; continue; }
    good.push({ ...r, profileId });
  }
  if (good.length === 0) return;
  for (const month of new Set(good.map((r) => r.orderedAt.toISOString().slice(0, 7)))) {
    const sample = good.find((r) => r.orderedAt.toISOString().startsWith(month))!;
    await c.query('SELECT engage.ensure_event_partition($1)', [sample.orderedAt.toISOString()]);
  }
  // A repeated order_id inside one chunk would collide with itself; the first occurrence wins.
  const seen = new Set<string>();
  const unique = good.filter((r) => (seen.has(r.orderId) ? (counts.events_already_imported++, false) : (seen.add(r.orderId), true)));
  const keys = await c.query<{ client_event_id: string; event_id: string }>(
    `INSERT INTO engage.event_keys (organization_id, client_event_id, event_id, occurred_at)
     SELECT $1, t.cid, gen_random_uuid(), t.at FROM unnest($2::text[], $3::timestamptz[]) AS t(cid, at)
     ON CONFLICT (organization_id, client_event_id) DO NOTHING RETURNING client_event_id, event_id`,
    [orgId, unique.map((r) => `import-order-${r.orderId}`), unique.map((r) => r.orderedAt.toISOString())]);
  const eventIdByCid = new Map(keys.rows.map((r) => [r.client_event_id, r.event_id]));
  const fresh = unique.filter((r) => eventIdByCid.has(`import-order-${r.orderId}`));
  counts.events_already_imported += unique.length - fresh.length;
  if (fresh.length === 0) return;
  await c.query(
    `INSERT INTO engage.events (organization_id, id, profile_id, client_event_id, name, properties, occurred_at)
     SELECT $1, t.id, t.profile_id, t.cid, 'order_completed', t.props::jsonb, t.at
       FROM unnest($2::uuid[], $3::uuid[], $4::text[], $5::text[], $6::timestamptz[]) AS t(id, profile_id, cid, props, at)`,
    [orgId, fresh.map((r) => eventIdByCid.get(`import-order-${r.orderId}`)), fresh.map((r) => r.profileId), fresh.map((r) => `import-order-${r.orderId}`),
      fresh.map((r) => JSON.stringify({ order_id: r.orderId, total: r.total, currency: r.currency, product_ids: r.productIds, source: 'import' })),
      fresh.map((r) => r.orderedAt.toISOString())]);
  counts.events_created += fresh.length;
}

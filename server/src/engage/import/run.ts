import type { PoolClient } from 'pg';
import { withEngageTenant } from '../db.js';
import { errorFields, logError, logInfo } from '../log.js';
import { CsvError, parseCsv } from './csv.js';
import {
  CHUNK_SIZE, ErrorSink, emptyCounts, parseOrderRows, parseProfileRows, writeOrderChunk, writeProfileChunk,
  type ImportCounts, type RowError,
} from './importers.js';

export type ImportKind = 'profiles' | 'orders';
export const IMPORT_KINDS: readonly ImportKind[] = ['profiles', 'orders'];
export const MAX_CSV_BYTES = 25 * 1024 * 1024;

export interface ImportReport {
  rowsTotal: number;
  counts: ImportCounts;
  errors: RowError[];
  errorsTotal: number;
  errorsTruncated: boolean;
}

class DryRunRollback extends Error {}

/**
 * Parse and write a CSV for one tenant. Real runs commit chunk by chunk (a stop part-way keeps what was written, and
 * re-running the same file is safe: profiles upsert, consents append only on change, orders dedupe on order id). A dry
 * run does the same work in ONE transaction and rolls it back, so the report shows exactly what would happen.
 * `onChunk` runs inside each chunk's transaction (used to record progress atomically with the data).
 */
export async function runImport(
  orgId: string,
  kind: ImportKind,
  csv: string,
  opts: { dryRun?: boolean; onChunk?: (c: PoolClient, processed: number) => Promise<void> } = {},
): Promise<ImportReport> {
  const table = parseCsv(csv);
  const sink = new ErrorSink();
  const counts = emptyCounts();
  counts.rows = table.rows.length;
  const profileRows = kind === 'profiles' ? parseProfileRows(table, sink) : [];
  const orderRows = kind === 'orders' ? parseOrderRows(table, sink) : [];
  counts.rows_rejected += table.rows.length - (kind === 'profiles' ? profileRows.length : orderRows.length);
  const items = kind === 'profiles' ? profileRows : orderRows;
  const finish = (): ImportReport => ({ rowsTotal: table.rows.length, counts, errors: sink.errors, errorsTotal: sink.total, errorsTruncated: sink.truncated });

  const writeChunk = async (c: PoolClient, from: number): Promise<void> => {
    if (kind === 'profiles') await writeProfileChunk(c, orgId, profileRows.slice(from, from + CHUNK_SIZE), counts, sink);
    else await writeOrderChunk(c, orgId, orderRows.slice(from, from + CHUNK_SIZE), counts, sink);
  };

  if (opts.dryRun) {
    try {
      await withEngageTenant(orgId, async (c) => {
        for (let from = 0; from < items.length; from += CHUNK_SIZE) await writeChunk(c, from);
        throw new DryRunRollback();
      });
    } catch (err) {
      if (!(err instanceof DryRunRollback)) throw err;
    }
    return finish();
  }
  for (let from = 0; from < items.length; from += CHUNK_SIZE) {
    await withEngageTenant(orgId, async (c) => {
      await writeChunk(c, from);
      await opts.onChunk?.(c, Math.min(from + CHUNK_SIZE, items.length));
    });
  }
  return finish();
}

// ------------------------------------------------------------------------------------------- import records

export interface ImportRecord {
  id: string;
  kind: ImportKind;
  status: 'queued' | 'running' | 'completed' | 'failed';
  dryRun: boolean;
  rowsTotal: number | null;
  rowsProcessed: number;
  counts: Partial<ImportCounts>;
  errors: RowError[];
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

const COLS = `id, kind, status, dry_run, rows_total, rows_processed, counts, errors, error_message, created_at, started_at, finished_at`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row {
  id: string; kind: ImportKind; status: ImportRecord['status']; dry_run: boolean; rows_total: number | null; rows_processed: number;
  counts: ImportRecord['counts']; errors: RowError[]; error_message: string | null; created_at: Date; started_at: Date | null; finished_at: Date | null;
}
const toRecord = (r: Row): ImportRecord => ({
  id: r.id, kind: r.kind, status: r.status, dryRun: r.dry_run, rowsTotal: r.rows_total, rowsProcessed: r.rows_processed,
  counts: r.counts, errors: r.errors, errorMessage: r.error_message,
  createdAt: r.created_at.toISOString(), startedAt: r.started_at?.toISOString() ?? null, finishedAt: r.finished_at?.toISOString() ?? null,
});

export class ImportInputError extends Error {}
export class ImportNotFoundError extends Error {}

export async function createImport(orgId: string, userId: string | null, kind: ImportKind, dryRun: boolean, csv: string): Promise<string> {
  if (!IMPORT_KINDS.includes(kind)) throw new ImportInputError('kind must be profiles or orders');
  if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) throw new ImportInputError('The file is larger than 25 MB');
  try { parseCsv(csv); } catch (err) { if (err instanceof CsvError) throw new ImportInputError(err.message); throw err; }
  return withEngageTenant(orgId, async (c) => {
    const r = await c.query<{ id: string }>(
      `INSERT INTO engage.imports (organization_id, kind, dry_run, content, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [orgId, kind, dryRun, csv, userId]);
    return r.rows[0]!.id;
  });
}

export async function getImport(orgId: string, id: string): Promise<ImportRecord> {
  if (!UUID_RE.test(id)) throw new ImportNotFoundError('Import not found');
  const r = await withEngageTenant(orgId, (c) => c.query<Row>(`SELECT ${COLS} FROM engage.imports WHERE organization_id = $1 AND id = $2`, [orgId, id]));
  if (!r.rows[0]) throw new ImportNotFoundError('Import not found');
  return toRecord(r.rows[0]);
}

export async function listImports(orgId: string): Promise<Array<Omit<ImportRecord, 'errors'>>> {
  const r = await withEngageTenant(orgId, (c) => c.query<Row>(
    `SELECT ${COLS} FROM engage.imports WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 50`, [orgId]));
  return r.rows.map((row) => { const { errors: _drop, ...rest } = toRecord(row); void _drop; return rest; });
}

export async function markFailed(orgId: string, id: string, message: string): Promise<void> {
  await withEngageTenant(orgId, (c) => c.query(
    `UPDATE engage.imports SET status = 'failed', error_message = $3, content = NULL, finished_at = now() WHERE organization_id = $1 AND id = $2`,
    [orgId, id, message]));
}

/**
 * The queue job. Safe to run twice: a completed import is left alone, an interrupted one is simply run again
 * (the writes are idempotent). The uploaded CSV is deleted from the database as soon as the job ends.
 */
export async function runImportJob(data: { importId: string; organizationId: string }): Promise<void> {
  const { importId, organizationId: orgId } = data;
  const rec = await withEngageTenant(orgId, async (c) => {
    const r = await c.query<{ kind: ImportKind; status: string; dry_run: boolean; content: string | null }>(
      `SELECT kind, status, dry_run, content FROM engage.imports WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, importId]);
    const row = r.rows[0];
    if (!row || row.status === 'completed' || row.status === 'failed') return null;
    await c.query(`UPDATE engage.imports SET status = 'running', started_at = COALESCE(started_at, now()) WHERE organization_id = $1 AND id = $2`, [orgId, importId]);
    return row;
  });
  if (!rec) return;
  if (!rec.content) return void (await markFailed(orgId, importId, 'The uploaded file is no longer available; upload it again'));
  try {
    const report = await runImport(orgId, rec.kind, rec.content, {
      dryRun: rec.dry_run,
      onChunk: async (c, processed) => {
        await c.query(`UPDATE engage.imports SET rows_processed = $3 WHERE organization_id = $1 AND id = $2`, [orgId, importId, processed]);
      },
    });
    await withEngageTenant(orgId, (c) => c.query(
      `UPDATE engage.imports SET status = 'completed', rows_total = $3, rows_processed = $3, counts = $4::jsonb, errors = $5::jsonb,
              error_message = $6, content = NULL, finished_at = now() WHERE organization_id = $1 AND id = $2`,
      [orgId, importId, report.rowsTotal, JSON.stringify(report.counts), JSON.stringify(report.errors),
        report.errorsTruncated ? `${report.errorsTotal} problems found; only the first ${report.errors.length} are listed` : null]));
    logInfo('import finished', { organizationId: orgId, importId, kind: rec.kind, dryRun: rec.dry_run, rows: report.rowsTotal, problems: report.errorsTotal });
  } catch (err) {
    if (err instanceof CsvError) return void (await markFailed(orgId, importId, err.message));
    logError('import failed', { organizationId: orgId, importId, ...errorFields(err) });
    await markFailed(orgId, importId, 'The import stopped because of a database error. Rows already written are kept; run the same file again to continue.');
    throw err;
  }
}

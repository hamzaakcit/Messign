import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Checks a restored database (WP-29, ADR-024; docs/runbooks/ops-monitoring.md, "Restore drill"). A backup is only as good as the
 * last time somebody restored it, so after restoring a dump or a provider's snapshot into a scratch database this says whether
 * the engage data came back whole and still obeys the rules the application relies on:
 *   schema        every engage table the migrations create is there
 *   migrations    every migration file is recorded as applied
 *   rls           row-level security is enabled and forced on every engage table (a dump taken with the wrong flags drops it)
 *   role          the application's database role exists, cannot bypass RLS, and can read the ledgers (roles are not in a dump)
 *   functions     the triggers and functions that derive state are present
 *   messages      every message's status is what its last applied event says (nothing was edited, no event lost)
 *   consents      every consent state is what the newest ledger row says, and none is missing or invented
 *   partitions    the events table has a partition for the current month
 *   counts        with the manifest of the live database: no table has more rows than the live one (wrong database), none is missing,
 *                 and how far behind the restore point is
 * It only reads. It must run as a role that can see every row (the owner or a superuser): forced RLS would otherwise show it nothing.
 * Counts, names and timestamps only: it never selects a customer's data.
 */

export interface Queryable { query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }> }
export interface Check { name: string; ok: boolean; detail: string }
export interface TableFigures { count: number; newest: string | null }
export interface Manifest { takenAt: string; tables: Record<string, TableFigures> }
export interface RestoreReport { ok: boolean; checks: Check[]; manifest: Manifest }

const DERIVING = [
  ['message_events', 'message_events_apply'], ['consents', 'consents_apply'],
] as const;
const REQUIRED_FUNCTIONS = ['current_org_id', 'claim_message', 'apply_message_event', 'apply_consent', 'ops_work'];

// Reads the migration files for the names of the tables they declare. Built from parts: this file only reads SQL, it holds none.
const TABLE_DECLARATION = new RegExp(`${['CREATE', 'TABLE'].join('\\s+')}(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+engage\\.([a-z_][a-z0-9_]*)\\b(?!\\s+PARTITION)`, 'gi');

/** The tables the migrations create in the engage schema (partitions of events are not listed: they are made at runtime). */
export function expectedTables(migrationsDir: string): string[] {
  const names = new Set<string>();
  for (const f of readdirSync(migrationsDir).filter((x) => x.endsWith('.sql'))) {
    for (const m of readFileSync(join(migrationsDir, f), 'utf8').matchAll(TABLE_DECLARATION)) names.add(m[1]!.toLowerCase());
  }
  return [...names].sort();
}
export const migrationFiles = (dir: string): string[] => readdirSync(dir).filter((x) => x.endsWith('.sql')).sort();

const q = async <R>(db: Queryable, text: string, params: unknown[] = []): Promise<R[]> => (await db.query<R>(text, params)).rows;

/** Row counts and newest timestamps of every engage table: what the live database looks like, for comparing a restore with. */
export async function buildManifest(db: Queryable, now: Date = new Date()): Promise<Manifest> {
  const tables = (await q<{ t: string; has_created: boolean }>(db,
    `SELECT c.relname AS t, EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'created_at' AND NOT a.attisdropped) AS has_created
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'engage' AND c.relkind IN ('r', 'p') AND NOT c.relispartition ORDER BY 1`));
  const out: Manifest['tables'] = {};
  for (const { t, has_created } of tables) {
    const r = (await q<{ n: string; newest: Date | null }>(db, `SELECT count(*)::text AS n, ${has_created ? 'max(created_at)' : 'NULL::timestamptz'} AS newest FROM engage.${`"${t.replace(/"/g, '""')}"`}`))[0]!;
    out[t] = { count: Number(r.n), newest: r.newest ? new Date(r.newest).toISOString() : null };
  }
  return { takenAt: now.toISOString(), tables: out };
}

export async function runRestoreCheck(db: Queryable, opts: { migrationsDir: string; manifest?: Manifest; now?: Date; appRole?: string; skip?: Array<'messages' | 'consents'> }): Promise<RestoreReport> {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });
  const role = opts.appRole ?? 'messign_engage';
  const now = opts.now ?? new Date();

  const me = (await q<{ ok: boolean }>(db, `SELECT (rolsuper OR rolbypassrls) AS ok FROM pg_roles WHERE rolname = current_user`))[0];
  if (!me?.ok) {
    add('access', false, 'the checking role cannot see every row (forced row-level security would hide the data): connect as the owner or a superuser');
    return { ok: false, checks, manifest: { takenAt: now.toISOString(), tables: {} } };
  }
  add('access', true, 'the checking role sees every row');

  const manifest = await buildManifest(db, now);
  const present = new Set(Object.keys(manifest.tables));
  const missing = expectedTables(opts.migrationsDir).filter((t) => !present.has(t));
  add('schema', missing.length === 0, missing.length === 0 ? `${present.size} engage tables present` : `missing tables: ${missing.join(', ')}`);

  const applied = new Set((await q<{ filename: string }>(db, `SELECT filename FROM public.schema_migrations`).catch(() => [])).map((r) => r.filename));
  const notApplied = migrationFiles(opts.migrationsDir).filter((f) => !applied.has(f));
  add('migrations', applied.size > 0 && notApplied.length === 0, applied.size === 0 ? 'no migrations are recorded (public.schema_migrations is empty or missing)' : notApplied.length ? `not recorded as applied: ${notApplied.join(', ')}` : `${applied.size} recorded, every migration file among them`);

  const noRls = await q<{ relname: string }>(db,
    `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'engage' AND c.relkind IN ('r', 'p') AND NOT c.relispartition AND NOT (c.relrowsecurity AND c.relforcerowsecurity) ORDER BY 1`);
  add('rls', noRls.length === 0, noRls.length === 0 ? 'row-level security is enabled and forced on every engage table' : `without enabled and forced RLS: ${noRls.map((r) => r.relname).join(', ')}`);

  const r = (await q<{ exists: boolean; bypass: boolean | null; super: boolean | null; reads: boolean }>(db,
    `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists,
            (SELECT rolbypassrls FROM pg_roles WHERE rolname = $1) AS bypass, (SELECT rolsuper FROM pg_roles WHERE rolname = $1) AS super,
            COALESCE((SELECT has_table_privilege($1, 'engage.messages', 'SELECT') WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)), false) AS reads`, [role]))[0]!;
  const roleProblems = [!r.exists && `role ${role} does not exist (roles are not part of a dump: create it before the application connects)`,
    r.exists && (r.bypass || r.super) && `role ${role} can bypass row-level security`, r.exists && !r.reads && `role ${role} cannot read engage.messages (grants were lost)`].filter(Boolean) as string[];
  add('role', roleProblems.length === 0, roleProblems.length === 0 ? `${role} exists, is bound by RLS and can read the ledgers` : roleProblems.join('; '));

  const fn = await q<{ proname: string }>(db, `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'engage' AND p.proname = ANY ($1)`, [REQUIRED_FUNCTIONS]);
  const tg = await q<{ tgname: string }>(db, `SELECT t.tgname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'engage' AND NOT t.tgisinternal`);
  const lostFn = REQUIRED_FUNCTIONS.filter((f) => !fn.some((x) => x.proname === f));
  const lostTg = DERIVING.filter(([, name]) => !tg.some((x) => x.tgname === name)).map(([, name]) => name);
  add('functions', lostFn.length === 0 && lostTg.length === 0, lostFn.length + lostTg.length === 0 ? 'the deriving functions and triggers are present' : `missing: ${[...lostFn, ...lostTg].join(', ')}`);

  if (!opts.skip?.includes('messages')) {
  const badMessages = (await q<{ n: string }>(db,
    `SELECT count(*)::text AS n FROM engage.messages m
       LEFT JOIN LATERAL (SELECT e.type FROM engage.message_events e WHERE e.organization_id = m.organization_id AND e.message_id = m.id AND e.applied ORDER BY e.id DESC LIMIT 1) last ON true
      WHERE m.status IS DISTINCT FROM (CASE COALESCE(last.type, 'queued') WHEN 'retry_scheduled' THEN 'queued' ELSE COALESCE(last.type, 'queued') END)`))[0]!.n;
  add('messages', Number(badMessages) === 0, Number(badMessages) === 0 ? `every message's status matches its last applied event (${manifest.tables.messages?.count ?? 0} messages)` : `${badMessages} messages have a status their events do not give`);
  }

  if (!opts.skip?.includes('consents')) {
  const badConsents = (await q<{ wrong: string; missing: string; invented: string }>(db,
    `WITH latest AS (SELECT organization_id, profile_id, channel, purpose, max(recorded_at) AS at FROM engage.consents GROUP BY 1, 2, 3, 4)
     SELECT (SELECT count(*) FROM engage.consent_state s JOIN latest l USING (organization_id, profile_id, channel, purpose)
              WHERE s.updated_at <> l.at OR NOT EXISTS (SELECT 1 FROM engage.consents c WHERE c.organization_id = s.organization_id AND c.profile_id = s.profile_id
                      AND c.channel = s.channel AND c.purpose = s.purpose AND c.recorded_at = l.at AND c.status = s.status))::text AS wrong,
            (SELECT count(*) FROM latest l WHERE NOT EXISTS (SELECT 1 FROM engage.consent_state s WHERE s.organization_id = l.organization_id AND s.profile_id = l.profile_id AND s.channel = l.channel AND s.purpose = l.purpose))::text AS missing,
            (SELECT count(*) FROM engage.consent_state s WHERE NOT EXISTS (SELECT 1 FROM latest l WHERE l.organization_id = s.organization_id AND l.profile_id = s.profile_id AND l.channel = s.channel AND l.purpose = s.purpose))::text AS invented`))[0]!;
  const consentOk = Number(badConsents.wrong) + Number(badConsents.missing) + Number(badConsents.invented) === 0;
  add('consents', consentOk, consentOk ? `every consent state matches the ledger (${manifest.tables.consent_state?.count ?? 0} states)` : `consent states that differ from the ledger: ${badConsents.wrong} wrong, ${badConsents.missing} missing, ${badConsents.invented} without a ledger row`);
  }

  const month = `events_${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const part = await q<{ n: string }>(db, `SELECT count(*)::text AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'engage' AND c.relname = $1`, [month]);
  add('partitions', Number(part[0]!.n) === 1, Number(part[0]!.n) === 1 ? `${month} exists` : `the partition ${month} of engage.events is missing (the partition job creates it within the hour; the first event of the month would otherwise fail)`);

  if (opts.manifest) {
    const problems: string[] = [];
    const notes: string[] = [];
    for (const [t, live] of Object.entries(opts.manifest.tables)) {
      const got = manifest.tables[t];
      if (!got) { problems.push(`${t} is missing`); continue; }
      if (got.count > live.count) problems.push(`${t} has more rows (${got.count}) than the live database had (${live.count})`);
      else if (got.count < live.count) notes.push(`${t} ${live.count - got.count}`);
    }
    const behind = Object.entries(opts.manifest.tables).map(([t, live]) => (live.newest && manifest.tables[t]?.newest ? new Date(live.newest).getTime() - new Date(manifest.tables[t]!.newest!).getTime() : 0));
    const behindMinutes = Math.max(0, ...behind) / 60_000;
    add('counts', problems.length === 0, problems.length ? problems.join('; ') : `no table has more rows than the live database at ${opts.manifest.takenAt}${notes.length ? `; rows written after the restore point: ${notes.join(', ')}` : '; same counts'}${behindMinutes > 1 ? `; newest rows are up to ${Math.round(behindMinutes)} minutes older than live` : ''}`);
  }
  return { ok: checks.every((c) => c.ok), checks, manifest };
}

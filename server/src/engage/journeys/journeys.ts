import { withEngageTenant } from '../db.js';
import { validateDefinition, type DefinitionIssue, type JourneyDefinition, type SegmentRef, type TemplateRef } from './definition.js';

/**
 * Journeys (WP-15): definitions, immutable versions, approval and activation. A version moves
 *   draft -> approved -> active -> retired
 * once each, never back. Activation needs approval (enforced by the database as well), and activating a version
 * retires the one that was active. Running journeys is WP-16; nothing here sends anything.
 */

export class JourneyInputError extends Error {
  constructor(message: string, public readonly issues: DefinitionIssue[] = []) { super(message); }
}
export class JourneyNotFoundError extends Error {}
export class JourneyConflictError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

type Tx = Parameters<Parameters<typeof withEngageTenant>[1]>[0];
export type VersionStatus = 'draft' | 'approved' | 'active' | 'retired';

export interface JourneyVersionView {
  id: string; version: number; status: VersionStatus; definition: JourneyDefinition;
  createdBy: string | null; createdAt: string;
  approvedBy: string | null; approvedAt: string | null;
  activatedBy: string | null; activatedAt: string | null;
  deactivatedBy: string | null; deactivatedAt: string | null;
}
export interface JourneyView { id: string; key: string; name: string; createdAt: string; activeVersion: number | null; latestVersion: number }

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
function toVersion(r: Record<string, unknown>): JourneyVersionView {
  const status: VersionStatus = r.deactivated_at ? 'retired' : r.activated_at ? 'active' : r.approved_at ? 'approved' : 'draft';
  return {
    id: String(r.id), version: Number(r.version), status, definition: r.definition as JourneyDefinition,
    createdBy: (r.created_by as string | null) ?? null, createdAt: iso(r.created_at)!,
    approvedBy: (r.approved_by as string | null) ?? null, approvedAt: iso(r.approved_at),
    activatedBy: (r.activated_by as string | null) ?? null, activatedAt: iso(r.activated_at),
    deactivatedBy: (r.deactivated_by as string | null) ?? null, deactivatedAt: iso(r.deactivated_at),
  };
}
const VERSION_COLS = 'id, version, definition, created_by, created_at, approved_by, approved_at, activated_by, activated_at, deactivated_by, deactivated_at';

/** Schema check, then: every template a message step names exists in this tenant (and the pinned version, if any). */
async function checkDefinition(c: Tx, orgId: string, input: unknown): Promise<JourneyDefinition> {
  const v = validateDefinition(input);
  if (!v.ok) throw new JourneyInputError('The journey definition is not valid', v.errors);
  const missing = await missingTemplates(c, orgId, v.templates);
  if (missing.length) throw new JourneyInputError('The journey uses templates that do not exist', missing);
  const noSegments = await missingSegments(c, orgId, v.segments);
  if (noSegments.length) throw new JourneyInputError('The journey uses a segment that does not exist', noSegments);
  return v.definition;
}

async function missingSegments(c: Tx, orgId: string, refs: SegmentRef[]): Promise<DefinitionIssue[]> {
  const issues: DefinitionIssue[] = [];
  for (const ref of refs) {
    const r = await c.query(
      `SELECT 1 FROM engage.segments s JOIN engage.segment_versions v ON v.organization_id = s.organization_id AND v.segment_id = s.id
        WHERE s.organization_id = $1 AND s.key = $2 AND v.version = $3`, [orgId, ref.key, ref.version]);
    if (!r.rowCount) issues.push({ path: 'trigger.segment', message: `no segment "${ref.key}" version ${ref.version}` });
  }
  return issues;
}

async function missingTemplates(c: Tx, orgId: string, refs: TemplateRef[]): Promise<DefinitionIssue[]> {
  const issues: DefinitionIssue[] = [];
  for (const ref of refs) {
    const r = await c.query<{ latest: number | null }>(
      `SELECT MAX(v.version) AS latest FROM engage.templates t
         JOIN engage.template_versions v ON v.organization_id = t.organization_id AND v.template_id = t.id
        WHERE t.organization_id = $1 AND t.key = $2`, [orgId, ref.key]);
    const latest = r.rows[0]?.latest ?? null;
    if (latest === null) issues.push({ path: `steps.${ref.stepId}.template`, message: `no template with key "${ref.key}"` });
    else if (ref.version !== null && ref.version > Number(latest)) issues.push({ path: `steps.${ref.stepId}.template_version`, message: `template "${ref.key}" has no version ${ref.version}` });
  }
  return issues;
}

// Lifecycle times use clock_timestamp(), not now(): now() is when the transaction began, which can be before an
// activation another transaction committed while this one waited for the journey lock, and the database requires
// approved <= activated <= retired.
const lockJourney = (c: Tx, orgId: string, journeyId: string) =>
  c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`engage-journey:${orgId}:${journeyId}`]);

async function insertVersion(c: Tx, orgId: string, journeyId: string, userId: string | null, definition: JourneyDefinition): Promise<JourneyVersionView> {
  await lockJourney(c, orgId, journeyId);
  const n = (await c.query<{ n: number }>(
    `SELECT COALESCE(MAX(version), 0) + 1 AS n FROM engage.journey_versions WHERE organization_id = $1 AND journey_id = $2`, [orgId, journeyId])).rows[0]!.n;
  const r = await c.query(
    `INSERT INTO engage.journey_versions (organization_id, journey_id, version, definition, created_by) VALUES ($1, $2, $3, $4::jsonb, $5)
     RETURNING ${VERSION_COLS}`, [orgId, journeyId, n, JSON.stringify(definition), userId]);
  return toVersion(r.rows[0]);
}

/** Inside a transaction the caller owns (a campaign creates its journey and its record in one). */
export async function createJourneyOn(c: Tx, orgId: string, userId: string | null, input: { key: string; name: string; definition: unknown }): Promise<{ journey: JourneyView; version: JourneyVersionView }> {
  if (typeof input?.key !== 'string' || !KEY_RE.test(input.key)) throw new JourneyInputError('key must be 1-64 of a-z, 0-9, _ or -, starting with a letter or digit');
  if (typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.length > 200) throw new JourneyInputError('name must be 1-200 characters');
  const definition = await checkDefinition(c, orgId, input.definition);
  const ins = await c.query(
    `INSERT INTO engage.journeys (organization_id, key, name, created_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (organization_id, key) DO NOTHING RETURNING id, key, name, created_at`, [orgId, input.key, input.name.trim(), userId]);
  if (!ins.rows[0]) throw new JourneyConflictError('A journey with this key already exists');
  const j = ins.rows[0];
  const version = await insertVersion(c, orgId, j.id, userId, definition);
  return { journey: { id: j.id, key: j.key, name: j.name, createdAt: iso(j.created_at)!, activeVersion: null, latestVersion: version.version }, version };
}

export async function createJourney(orgId: string, userId: string | null, input: { key: string; name: string; definition: unknown }): Promise<{ journey: JourneyView; version: JourneyVersionView }> {
  return withEngageTenant(orgId, (c) => createJourneyOn(c, orgId, userId, input));
}

async function requireJourney(c: Tx, orgId: string, journeyId: string): Promise<void> {
  if (!UUID_RE.test(journeyId)) throw new JourneyNotFoundError('Journey not found');
  const r = await c.query(`SELECT 1 FROM engage.journeys WHERE organization_id = $1 AND id = $2`, [orgId, journeyId]);
  if (!r.rowCount) throw new JourneyNotFoundError('Journey not found');
}

export async function addJourneyVersion(orgId: string, userId: string | null, journeyId: string, definition: unknown): Promise<JourneyVersionView> {
  return withEngageTenant(orgId, async (c) => {
    await requireJourney(c, orgId, journeyId);
    return insertVersion(c, orgId, journeyId, userId, await checkDefinition(c, orgId, definition));
  });
}

/** Validate without storing (for an editor): schema, graph and template references. */
export async function checkJourneyDefinition(orgId: string, definition: unknown): Promise<{ ok: boolean; errors: DefinitionIssue[] }> {
  return withEngageTenant(orgId, async (c) => {
    try { await checkDefinition(c, orgId, definition); return { ok: true, errors: [] }; } catch (err) {
      if (err instanceof JourneyInputError) return { ok: false, errors: err.issues.length ? err.issues : [{ path: '(root)', message: err.message }] };
      throw err;
    }
  });
}

async function loadVersion(c: Tx, orgId: string, journeyId: string, version: number): Promise<JourneyVersionView> {
  await requireJourney(c, orgId, journeyId);
  if (!Number.isInteger(version) || version < 1) throw new JourneyInputError('version must be a positive integer');
  const r = await c.query(`SELECT ${VERSION_COLS} FROM engage.journey_versions WHERE organization_id = $1 AND journey_id = $2 AND version = $3`, [orgId, journeyId, version]);
  if (!r.rows[0]) throw new JourneyNotFoundError('Journey version not found');
  return toVersion(r.rows[0]);
}

/**
 * A person approves a draft version. The definition is checked again (templates referenced must still exist). Approval
 * by the person who created the version is allowed for now: most pilot tenants have one admin (decision D-13 open).
 */
export async function approveJourneyVersionOn(c: Tx, orgId: string, userId: string, journeyId: string, version: number): Promise<JourneyVersionView> {
  if (!UUID_RE.test(userId)) throw new JourneyInputError('an approval needs a known user');
  await lockJourney(c, orgId, journeyId);
  const v = await loadVersion(c, orgId, journeyId, version);
  if (v.status !== 'draft') throw new JourneyConflictError(`Version ${version} is already ${v.status}`);
  await checkDefinition(c, orgId, v.definition);
  const r = await c.query(
    `UPDATE engage.journey_versions SET approved_by = $4, approved_at = clock_timestamp()
      WHERE organization_id = $1 AND journey_id = $2 AND version = $3 AND approved_at IS NULL RETURNING ${VERSION_COLS}`,
    [orgId, journeyId, version, userId]);
  return toVersion(r.rows[0]);
}

export async function approveJourneyVersion(orgId: string, userId: string, journeyId: string, version: number): Promise<JourneyVersionView> {
  if (!UUID_RE.test(userId)) throw new JourneyInputError('an approval needs a known user');
  return withEngageTenant(orgId, (c) => approveJourneyVersionOn(c, orgId, userId, journeyId, version));
}

/** Activates an approved version and retires the version that was active, in one transaction. */
export async function activateJourneyVersionOn(c: Tx, orgId: string, userId: string, journeyId: string, version: number): Promise<JourneyVersionView> {
  if (!UUID_RE.test(userId)) throw new JourneyInputError('an activation needs a known user');
  await lockJourney(c, orgId, journeyId);
  const v = await loadVersion(c, orgId, journeyId, version);
  if (v.status === 'active') return v;
  if (v.status === 'draft') throw new JourneyConflictError(`Version ${version} is not approved`);
  if (v.status === 'retired') throw new JourneyConflictError(`Version ${version} was retired; publish a new version to use it again`);
  await checkDefinition(c, orgId, v.definition);
  await c.query(
    `UPDATE engage.journey_versions SET deactivated_by = $3, deactivated_at = clock_timestamp()
      WHERE organization_id = $1 AND journey_id = $2 AND activated_at IS NOT NULL AND deactivated_at IS NULL`,
    [orgId, journeyId, userId]);
  const r = await c.query(
    `UPDATE engage.journey_versions SET activated_by = $4, activated_at = clock_timestamp()
      WHERE organization_id = $1 AND journey_id = $2 AND version = $3 RETURNING ${VERSION_COLS}`,
    [orgId, journeyId, version, userId]);
  return toVersion(r.rows[0]);
}

export async function activateJourneyVersion(orgId: string, userId: string, journeyId: string, version: number): Promise<JourneyVersionView> {
  if (!UUID_RE.test(userId)) throw new JourneyInputError('an activation needs a known user');
  return withEngageTenant(orgId, (c) => activateJourneyVersionOn(c, orgId, userId, journeyId, version));
}

/** Stops a journey: retires its active version. Nothing is active afterwards until a version is activated. */
export async function deactivateJourney(orgId: string, userId: string, journeyId: string): Promise<{ retiredVersion: number | null }> {
  if (!UUID_RE.test(userId)) throw new JourneyInputError('a deactivation needs a known user');
  return withEngageTenant(orgId, async (c) => {
    await requireJourney(c, orgId, journeyId);
    await lockJourney(c, orgId, journeyId);
    const r = await c.query<{ version: number }>(
      `UPDATE engage.journey_versions SET deactivated_by = $3, deactivated_at = clock_timestamp()
        WHERE organization_id = $1 AND journey_id = $2 AND activated_at IS NOT NULL AND deactivated_at IS NULL RETURNING version`,
      [orgId, journeyId, userId]);
    return { retiredVersion: r.rows[0]?.version ?? null };
  });
}

export async function listJourneys(orgId: string): Promise<JourneyView[]> {
  return withEngageTenant(orgId, async (c) => (await c.query(
    `SELECT j.id, j.key, j.name, j.created_at, MAX(v.version) AS latest,
            MAX(v.version) FILTER (WHERE v.activated_at IS NOT NULL AND v.deactivated_at IS NULL) AS active
       FROM engage.journeys j JOIN engage.journey_versions v ON v.organization_id = j.organization_id AND v.journey_id = j.id
      WHERE j.organization_id = $1
        AND NOT EXISTS (SELECT 1 FROM engage.campaigns k WHERE k.organization_id = j.organization_id AND k.journey_id = j.id)
      GROUP BY j.id ORDER BY j.created_at DESC`, [orgId])).rows.map((r) => ({
    id: r.id, key: r.key, name: r.name, createdAt: iso(r.created_at)!, latestVersion: Number(r.latest), activeVersion: r.active === null ? null : Number(r.active),
  })));
}

export async function getJourney(orgId: string, journeyId: string): Promise<{ journey: JourneyView; versions: JourneyVersionView[] }> {
  return withEngageTenant(orgId, async (c) => {
    await requireJourney(c, orgId, journeyId);
    const j = (await c.query(`SELECT id, key, name, created_at FROM engage.journeys WHERE organization_id = $1 AND id = $2`, [orgId, journeyId])).rows[0];
    const versions = (await c.query(`SELECT ${VERSION_COLS} FROM engage.journey_versions WHERE organization_id = $1 AND journey_id = $2 ORDER BY version DESC`,
      [orgId, journeyId])).rows.map(toVersion);
    const active = versions.find((v) => v.status === 'active')?.version ?? null;
    return { journey: { id: j.id, key: j.key, name: j.name, createdAt: iso(j.created_at)!, activeVersion: active, latestVersion: versions[0]!.version }, versions };
  });
}

/** The active version of a journey by key, for the executor (WP-16) and the trigger API. */
export async function getActiveJourneyVersion(orgId: string, key: string): Promise<{ journeyId: string; version: JourneyVersionView } | null> {
  if (!KEY_RE.test(key)) return null;
  return withEngageTenant(orgId, async (c) => {
    const r = await c.query(
      `SELECT j.id AS journey_id, v.${VERSION_COLS.split(', ').join(', v.')}
         FROM engage.journeys j JOIN engage.journey_versions v ON v.organization_id = j.organization_id AND v.journey_id = j.id
        WHERE j.organization_id = $1 AND j.key = $2 AND v.activated_at IS NOT NULL AND v.deactivated_at IS NULL`, [orgId, key]);
    return r.rows[0] ? { journeyId: r.rows[0].journey_id, version: toVersion(r.rows[0]) } : null;
  });
}

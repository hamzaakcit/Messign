import { withEngageTenant } from '../db.js';
import { buildSegmentQuery } from './compile.js';
import { validateSegmentDefinition, type SegmentDefinition, type SegmentIssue } from './definition.js';

/** Segments (WP-36): named, versioned audiences. Reads and counts run in the tenant's own context. */

export class SegmentInputError extends Error {
  constructor(message: string, public readonly issues: SegmentIssue[] = []) { super(message); }
}
export class SegmentNotFoundError extends Error {}
export class SegmentConflictError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
type Tx = Parameters<Parameters<typeof withEngageTenant>[1]>[0];
const iso = (v: unknown) => new Date(v as string).toISOString();

export interface SegmentVersionView { id: string; version: number; definition: SegmentDefinition; createdBy: string | null; createdAt: string }
export interface SegmentView { id: string; key: string; name: string; createdAt: string; latestVersion: number }

function check(definition: unknown): SegmentDefinition {
  const v = validateSegmentDefinition(definition);
  if (!v.ok) throw new SegmentInputError('The segment definition is not valid', v.errors);
  return v.definition;
}
const lock = (c: Tx, orgId: string, id: string) => c.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`engage-segment:${orgId}:${id}`]);

async function insertVersion(c: Tx, orgId: string, segmentId: string, userId: string | null, def: SegmentDefinition): Promise<SegmentVersionView> {
  await lock(c, orgId, segmentId);
  const n = (await c.query<{ n: number }>(`SELECT COALESCE(MAX(version), 0) + 1 AS n FROM engage.segment_versions WHERE organization_id = $1 AND segment_id = $2`, [orgId, segmentId])).rows[0]!.n;
  const r = await c.query(
    `INSERT INTO engage.segment_versions (organization_id, segment_id, version, definition, created_by) VALUES ($1, $2, $3, $4::jsonb, $5)
     RETURNING id, version, definition, created_by, created_at`, [orgId, segmentId, n, JSON.stringify(def), userId]);
  const x = r.rows[0];
  return { id: x.id, version: x.version, definition: x.definition, createdBy: x.created_by ?? null, createdAt: iso(x.created_at) };
}

export async function createSegment(orgId: string, userId: string | null, input: { key: string; name: string; definition: unknown }): Promise<{ segment: SegmentView; version: SegmentVersionView }> {
  if (!KEY_RE.test(input.key)) throw new SegmentInputError('key must be lowercase letters, digits, - or _ (up to 64 characters)');
  const name = input.name?.trim();
  if (!name || name.length > 200) throw new SegmentInputError('name must be 1 to 200 characters');
  const def = check(input.definition);
  return withEngageTenant(orgId, async (c) => {
    const ins = await c.query<{ id: string; created_at: Date }>(
      `INSERT INTO engage.segments (organization_id, key, name, created_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, key) DO NOTHING RETURNING id, created_at`, [orgId, input.key, name, userId]);
    if (!ins.rows[0]) throw new SegmentConflictError('A segment with this key already exists');
    const version = await insertVersion(c, orgId, ins.rows[0].id, userId, def);
    return { segment: { id: ins.rows[0].id, key: input.key, name, createdAt: iso(ins.rows[0].created_at), latestVersion: 1 }, version };
  });
}

async function requireSegment(c: Tx, orgId: string, id: string): Promise<{ id: string; key: string; name: string; created_at: Date }> {
  if (!UUID_RE.test(id)) throw new SegmentNotFoundError('Segment not found');
  const r = await c.query(`SELECT id, key, name, created_at FROM engage.segments WHERE organization_id = $1 AND id = $2`, [orgId, id]);
  if (!r.rows[0]) throw new SegmentNotFoundError('Segment not found');
  return r.rows[0];
}

export async function addSegmentVersion(orgId: string, userId: string | null, segmentId: string, definition: unknown): Promise<SegmentVersionView> {
  const def = check(definition);
  return withEngageTenant(orgId, async (c) => { await requireSegment(c, orgId, segmentId); return insertVersion(c, orgId, segmentId, userId, def); });
}

export async function listSegments(orgId: string): Promise<SegmentView[]> {
  return withEngageTenant(orgId, async (c) => (await c.query(
    `SELECT s.id, s.key, s.name, s.created_at, (SELECT max(v.version) FROM engage.segment_versions v WHERE v.organization_id = s.organization_id AND v.segment_id = s.id) AS latest
       FROM engage.segments s WHERE s.organization_id = $1 ORDER BY s.created_at DESC`, [orgId])).rows
    .map((r) => ({ id: r.id, key: r.key, name: r.name, createdAt: iso(r.created_at), latestVersion: r.latest })));
}

export async function getSegment(orgId: string, segmentId: string): Promise<{ segment: SegmentView; versions: SegmentVersionView[] }> {
  return withEngageTenant(orgId, async (c) => {
    const s = await requireSegment(c, orgId, segmentId);
    const v = (await c.query(`SELECT id, version, definition, created_by, created_at FROM engage.segment_versions WHERE organization_id = $1 AND segment_id = $2 ORDER BY version DESC`, [orgId, segmentId])).rows
      .map((x): SegmentVersionView => ({ id: x.id, version: x.version, definition: x.definition, createdBy: x.created_by ?? null, createdAt: iso(x.created_at) }));
    return { segment: { id: s.id, key: s.key, name: s.name, createdAt: iso(s.created_at), latestVersion: v[0]?.version ?? 0 }, versions: v };
  });
}

export interface SegmentPreview { count: number; sample: Array<{ id: string; externalId: string }>; evaluatedAt: string }

/** How many customers match, and a few of them (newest first), as of `at` (default: now). Stores nothing. */
export async function countSegmentOn(c: Tx, orgId: string, def: SegmentDefinition, at: Date, sampleSize = 10): Promise<SegmentPreview> {
  const count = buildSegmentQuery(def, orgId, at, { mode: 'count' });
  const n = (await c.query<{ n: number }>(count.text, count.params)).rows[0]!.n;
  const sample = sampleSize > 0 ? buildSegmentQuery(def, orgId, at, { mode: 'sample', limit: sampleSize }) : null;
  const rows = sample ? (await c.query<{ id: string; external_id: string }>(sample.text, sample.params)).rows : [];
  return { count: n, sample: rows.map((r) => ({ id: r.id, externalId: r.external_id })), evaluatedAt: at.toISOString() };
}

export async function previewSegment(orgId: string, definition: unknown, at: Date = new Date()): Promise<SegmentPreview> {
  const def = check(definition);
  return withEngageTenant(orgId, (c) => countSegmentOn(c, orgId, def, at));
}

export async function countSegmentVersion(orgId: string, segmentId: string, version: number, at: Date = new Date()): Promise<SegmentPreview> {
  return withEngageTenant(orgId, async (c) => {
    await requireSegment(c, orgId, segmentId);
    const r = await c.query(`SELECT definition FROM engage.segment_versions WHERE organization_id = $1 AND segment_id = $2 AND version = $3`, [orgId, segmentId, version]);
    if (!r.rows[0]) throw new SegmentNotFoundError('Segment version not found');
    return countSegmentOn(c, orgId, r.rows[0].definition as SegmentDefinition, at);
  });
}

/**
 * Competitor Intelligence — Profile + Event Store
 *
 * Manages competitor profiles and their tracked events.
 * Events are collected by the scraper (Session 2) and
 * queried by the Dora tool (Session 3).
 */

import { createHash } from 'crypto';
import type { DbClient } from './performanceCollector.js';

// ── Types: Competitor Profile ──

export interface Competitor {
  id: string;
  organization_id: string;
  name: string;
  website_url: string | null;
  description: string | null;
  logo_url: string | null;
  monitor_urls: string[];
  monitor_email: boolean;
  monitor_social: boolean;
  industry: string | null;
  tier: 'direct' | 'indirect' | 'aspirational';
  active: boolean;
  last_scraped_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCompetitorInput {
  organizationId: string;
  name: string;
  websiteUrl?: string;
  description?: string;
  logoUrl?: string;
  monitorUrls?: string[];
  monitorEmail?: boolean;
  monitorSocial?: boolean;
  industry?: string;
  tier?: 'direct' | 'indirect' | 'aspirational';
  createdBy?: string;
}

export interface UpdateCompetitorInput {
  name?: string;
  websiteUrl?: string;
  description?: string;
  logoUrl?: string;
  monitorUrls?: string[];
  monitorEmail?: boolean;
  monitorSocial?: boolean;
  industry?: string;
  tier?: 'direct' | 'indirect' | 'aspirational';
  active?: boolean;
}

// ── Types: Competitor Event ──

export const EVENT_TYPES = [
  'blog_post', 'product_launch', 'pricing_change',
  'email_campaign', 'social_post', 'press_release',
  'feature_update', 'partnership', 'funding', 'other',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const SIGNIFICANCE_LEVELS = ['low', 'normal', 'high', 'critical'] as const;
export type SignificanceLevel = (typeof SIGNIFICANCE_LEVELS)[number];

export interface CompetitorEvent {
  id: string;
  organization_id: string;
  competitor_id: string;
  event_type: EventType;
  title: string;
  summary: string | null;
  body_text: string | null;
  source_url: string | null;
  image_url: string | null;
  tags: string[];
  sentiment: 'positive' | 'negative' | 'neutral' | null;
  significance: SignificanceLevel;
  ai_analysis: string | null;
  ai_analyzed_at: string | null;
  content_hash: string | null;
  event_date: string | null;
  discovered_at: string;
  created_at: string;
}

export interface CreateEventInput {
  organizationId: string;
  competitorId: string;
  eventType: EventType;
  title: string;
  summary?: string;
  bodyText?: string;
  sourceUrl?: string;
  imageUrl?: string;
  tags?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  significance?: SignificanceLevel;
  eventDate?: string;
}

export interface EventQueryOptions {
  competitorId?: string;
  eventType?: EventType;
  significance?: SignificanceLevel;
  since?: string;
  limit?: number;
  offset?: number;
}

// ══════════════════════════════════════════════════════════
// Competitor Profile CRUD
// ══════════════════════════════════════════════════════════

export async function createCompetitor(
  input: CreateCompetitorInput,
  db: DbClient,
): Promise<Competitor> {
  const {
    organizationId, name, websiteUrl, description, logoUrl,
    monitorUrls, monitorEmail, monitorSocial, industry, tier, createdBy,
  } = input;

  if (!name || name.trim().length === 0) {
    throw new Error('Competitor name is required');
  }

  const dupeCheck = await db.query(
    `SELECT id FROM competitors
     WHERE organization_id = $1 AND LOWER(name) = LOWER($2) AND active = true`,
    [organizationId, name.trim()],
  );
  if (dupeCheck.rows.length > 0) {
    throw new Error(`Competitor "${name}" already exists in this workspace`);
  }

  const validUrls = (monitorUrls || []).filter((url) => {
    try { new URL(url); return true; } catch { return false; }
  });

  const result = await db.query(
    `INSERT INTO competitors (
      organization_id, name, website_url, description, logo_url,
      monitor_urls, monitor_email, monitor_social,
      industry, tier, active, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $11)
    RETURNING *`,
    [
      organizationId, name.trim(), websiteUrl || null, description || null,
      logoUrl || null, validUrls, monitorEmail ?? false, monitorSocial ?? false,
      industry || null, tier || 'direct', createdBy || null,
    ],
  );

  return result.rows[0] as unknown as Competitor;
}

export async function getCompetitor(
  competitorId: string,
  db: DbClient,
): Promise<Competitor | null> {
  const result = await db.query(
    'SELECT * FROM competitors WHERE id = $1',
    [competitorId],
  );
  if (result.rows.length === 0) return null;
  return result.rows[0] as unknown as Competitor;
}

export async function listCompetitors(
  organizationId: string,
  options: { includeInactive?: boolean; limit?: number; offset?: number },
  db: DbClient,
): Promise<{ competitors: Competitor[]; total: number }> {
  const { includeInactive = false, limit = 50, offset = 0 } = options;

  let where = 'WHERE organization_id = $1';
  const params: unknown[] = [organizationId];
  if (!includeInactive) where += ' AND active = true';

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM competitors ${where}`, params,
  );

  params.push(limit, offset);
  const listResult = await db.query(
    `SELECT * FROM competitors ${where}
     ORDER BY tier ASC, name ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    competitors: listResult.rows as unknown as Competitor[],
    total: parseInt(String(countResult.rows[0]?.total ?? 0), 10),
  };
}

export async function updateCompetitor(
  competitorId: string,
  updates: UpdateCompetitorInput,
  db: DbClient,
): Promise<Competitor | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (updates.name !== undefined) {
    if (!updates.name || updates.name.trim().length === 0) throw new Error('Name cannot be empty');
    setClauses.push(`name = $${idx++}`);
    params.push(updates.name.trim());
  }
  if (updates.websiteUrl !== undefined) {
    setClauses.push(`website_url = $${idx++}`);
    params.push(updates.websiteUrl);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${idx++}`);
    params.push(updates.description);
  }
  if (updates.logoUrl !== undefined) {
    setClauses.push(`logo_url = $${idx++}`);
    params.push(updates.logoUrl);
  }
  if (updates.monitorUrls !== undefined) {
    const valid = updates.monitorUrls.filter((u) => {
      try { new URL(u); return true; } catch { return false; }
    });
    setClauses.push(`monitor_urls = $${idx++}`);
    params.push(valid);
  }
  if (updates.monitorEmail !== undefined) {
    setClauses.push(`monitor_email = $${idx++}`);
    params.push(updates.monitorEmail);
  }
  if (updates.monitorSocial !== undefined) {
    setClauses.push(`monitor_social = $${idx++}`);
    params.push(updates.monitorSocial);
  }
  if (updates.industry !== undefined) {
    setClauses.push(`industry = $${idx++}`);
    params.push(updates.industry);
  }
  if (updates.tier !== undefined) {
    setClauses.push(`tier = $${idx++}`);
    params.push(updates.tier);
  }
  if (updates.active !== undefined) {
    setClauses.push(`active = $${idx++}`);
    params.push(updates.active);
  }

  if (setClauses.length === 0) return getCompetitor(competitorId, db);

  setClauses.push('updated_at = now()');
  params.push(competitorId);

  const result = await db.query(
    `UPDATE competitors SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
    params,
  );
  if (result.rows.length === 0) return null;
  return result.rows[0] as unknown as Competitor;
}

export async function deleteCompetitor(
  competitorId: string,
  db: DbClient,
): Promise<boolean> {
  const result = await db.query(
    'UPDATE competitors SET active = false, updated_at = now() WHERE id = $1 AND active = true RETURNING id',
    [competitorId],
  );
  return result.rows.length > 0;
}

// ══════════════════════════════════════════════════════════
// Event Store
// ══════════════════════════════════════════════════════════

export async function recordEvent(
  input: CreateEventInput,
  db: DbClient,
): Promise<{ id: string; isNew: boolean }> {
  const {
    organizationId, competitorId, eventType, title, summary,
    bodyText, sourceUrl, imageUrl, tags, sentiment, significance, eventDate,
  } = input;

  if (!title || title.trim().length === 0) {
    throw new Error('Event title is required');
  }

  if (!EVENT_TYPES.includes(eventType)) {
    throw new Error(`Invalid event type: ${eventType}`);
  }

  const contentHash = generateContentHash(title, sourceUrl);

  if (contentHash) {
    const dupeCheck = await db.query(
      `SELECT id FROM competitor_events
       WHERE organization_id = $1 AND competitor_id = $2 AND content_hash = $3`,
      [organizationId, competitorId, contentHash],
    );
    if (dupeCheck.rows.length > 0) {
      return { id: dupeCheck.rows[0].id as string, isNew: false };
    }
  }

  const result = await db.query(
    `INSERT INTO competitor_events (
      organization_id, competitor_id, event_type,
      title, summary, body_text, source_url, image_url,
      tags, sentiment, significance,
      content_hash, event_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id`,
    [
      organizationId, competitorId, eventType,
      title.trim(), summary || null, bodyText || null,
      sourceUrl || null, imageUrl || null,
      tags || [], sentiment || null, significance || 'normal',
      contentHash, eventDate || null,
    ],
  );

  return { id: result.rows[0].id as string, isNew: true };
}

export async function queryEvents(
  organizationId: string,
  options: EventQueryOptions,
  db: DbClient,
): Promise<{ events: CompetitorEvent[]; total: number }> {
  const { competitorId, eventType, significance, since, limit = 50, offset = 0 } = options;

  let where = 'WHERE organization_id = $1';
  const params: unknown[] = [organizationId];

  if (competitorId) {
    params.push(competitorId);
    where += ` AND competitor_id = $${params.length}`;
  }
  if (eventType) {
    params.push(eventType);
    where += ` AND event_type = $${params.length}`;
  }
  if (significance) {
    params.push(significance);
    where += ` AND significance = $${params.length}`;
  }
  if (since) {
    params.push(since);
    where += ` AND discovered_at >= $${params.length}`;
  }

  const countResult = await db.query(
    `SELECT COUNT(*) as total FROM competitor_events ${where}`, params,
  );

  params.push(limit, offset);
  const eventsResult = await db.query(
    `SELECT * FROM competitor_events ${where}
     ORDER BY discovered_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return {
    events: eventsResult.rows as unknown as CompetitorEvent[],
    total: parseInt(String(countResult.rows[0]?.total ?? 0), 10),
  };
}

export async function getRecentEvents(
  organizationId: string,
  limit: number = 20,
  db: DbClient,
): Promise<CompetitorEvent[]> {
  const result = await db.query(
    `SELECT ce.*, c.name as competitor_name
     FROM competitor_events ce
     JOIN competitors c ON ce.competitor_id = c.id
     WHERE ce.organization_id = $1
     ORDER BY ce.discovered_at DESC
     LIMIT $2`,
    [organizationId, limit],
  );
  return result.rows as unknown as CompetitorEvent[];
}

export async function getSignificantEvents(
  organizationId: string,
  since: string,
  db: DbClient,
): Promise<CompetitorEvent[]> {
  const result = await db.query(
    `SELECT ce.*, c.name as competitor_name
     FROM competitor_events ce
     JOIN competitors c ON ce.competitor_id = c.id
     WHERE ce.organization_id = $1
       AND ce.significance IN ('high', 'critical')
       AND ce.discovered_at >= $2
     ORDER BY ce.discovered_at DESC`,
    [organizationId, since],
  );
  return result.rows as unknown as CompetitorEvent[];
}

export async function updateEventAnalysis(
  eventId: string,
  analysis: string,
  db: DbClient,
): Promise<void> {
  await db.query(
    `UPDATE competitor_events
     SET ai_analysis = $1, ai_analyzed_at = now()
     WHERE id = $2`,
    [analysis, eventId],
  );
}

export async function getCompetitorEventCounts(
  organizationId: string,
  since: string,
  db: DbClient,
): Promise<Array<{ competitor_id: string; competitor_name: string; event_count: number }>> {
  const result = await db.query(
    `SELECT
       c.id as competitor_id,
       c.name as competitor_name,
       COUNT(ce.id)::integer as event_count
     FROM competitors c
     LEFT JOIN competitor_events ce ON ce.competitor_id = c.id AND ce.discovered_at >= $2
     WHERE c.organization_id = $1 AND c.active = true
     GROUP BY c.id, c.name
     ORDER BY event_count DESC`,
    [organizationId, since],
  );
  return result.rows as unknown as Array<{ competitor_id: string; competitor_name: string; event_count: number }>;
}

export async function markScraped(
  competitorId: string,
  db: DbClient,
): Promise<void> {
  await db.query(
    'UPDATE competitors SET last_scraped_at = now() WHERE id = $1',
    [competitorId],
  );
}

// ── Helpers ──

export function generateContentHash(title: string, sourceUrl?: string | null): string | null {
  if (!title) return null;
  const input = `${title.trim().toLowerCase()}|${(sourceUrl || '').trim().toLowerCase()}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 32);
}

export function isValidEventType(type: string): type is EventType {
  return EVENT_TYPES.includes(type as EventType);
}

export function isValidSignificance(level: string): level is SignificanceLevel {
  return SIGNIFICANCE_LEVELS.includes(level as SignificanceLevel);
}

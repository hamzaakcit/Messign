import { query } from './index.js';
import type { Badge } from '../types/index.js';

interface BadgeRow {
  id: string;
  name: string;
  icon: string;
  type: string;
  description: string;
  rarity: string;
  criteria: string | null;
  holders: string[];
}

function mapRowToBadge(row: BadgeRow): Badge {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    type: row.type as Badge['type'],
    description: row.description,
    rarity: row.rarity as Badge['rarity'],
    holders: row.holders ?? [],
    criteria: row.criteria ?? undefined,
  };
}

const BADGE_SELECT = `
  b.id, b.name, b.icon, b.type, b.description, b.rarity, b.criteria,
  COALESCE(
    (SELECT array_agg(ub.user_id ORDER BY ub.earned_at) FROM user_badges ub WHERE ub.badge_id = b.id),
    ARRAY[]::text[]
  ) AS holders
`;

export async function getBadgeById(id: string): Promise<Badge | null> {
  const result = await query<BadgeRow>(
    `SELECT ${BADGE_SELECT}
     FROM badges b WHERE b.id = $1`,
    [id]
  );
  const row = result.rows[0];
  return row ? mapRowToBadge(row) : null;
}

export async function getBadgesForUser(userId: string): Promise<Badge[]> {
  const result = await query<BadgeRow>(
    `SELECT ${BADGE_SELECT}
     FROM badges b
     INNER JOIN user_badges ub ON ub.badge_id = b.id
     WHERE ub.user_id = $1
     ORDER BY b.name`,
    [userId]
  );
  return result.rows.map(mapRowToBadge);
}

/** One query for many users; omits per-badge `holders` aggregate (list/avatar use only). */
export async function getBadgesForUsers(userIds: string[]): Promise<Map<string, Badge[]>> {
  const byUser = new Map<string, Badge[]>();
  if (userIds.length === 0) return byUser;

  const result = await query<{
    user_id: string;
    id: string;
    name: string;
    icon: string;
    type: string;
    description: string;
    rarity: string;
    criteria: string | null;
  }>(
    `SELECT ub.user_id::text AS user_id,
            b.id, b.name, b.icon, b.type, b.description, b.rarity, b.criteria
     FROM user_badges ub
     INNER JOIN badges b ON b.id = ub.badge_id
     WHERE ub.user_id = ANY($1::text[])
     ORDER BY ub.user_id, b.name`,
    [userIds]
  );

  for (const row of result.rows) {
    const badge: Badge = {
      id: row.id,
      name: row.name,
      icon: row.icon,
      type: row.type as Badge['type'],
      description: row.description,
      rarity: row.rarity as Badge['rarity'],
      holders: [],
      criteria: row.criteria ?? undefined,
    };
    const uid = row.user_id;
    const list = byUser.get(uid);
    if (list) list.push(badge);
    else byUser.set(uid, [badge]);
  }
  return byUser;
}

export async function getAllBadges(): Promise<Badge[]> {
  const result = await query<BadgeRow>(
    `SELECT ${BADGE_SELECT}
     FROM badges b
     ORDER BY b.name`,
    []
  );
  return result.rows.map(mapRowToBadge);
}

export async function addBadge(badge: {
  id: string;
  name: string;
  icon: string;
  type: Badge['type'];
  description: string;
  rarity: Badge['rarity'];
  criteria?: string;
}): Promise<Badge> {
  await query(
    `INSERT INTO badges (id, name, icon, type, description, rarity, criteria)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, icon = EXCLUDED.icon, type = EXCLUDED.type,
       description = EXCLUDED.description, rarity = EXCLUDED.rarity, criteria = EXCLUDED.criteria,
       updated_at = NOW()`,
    [
      badge.id,
      badge.name,
      badge.icon,
      badge.type,
      badge.description,
      badge.rarity,
      badge.criteria ?? null,
    ]
  );
  const out = await getBadgeById(badge.id);
  if (!out) throw new Error('Badge insert failed');
  return out;
}

export async function updateBadge(
  id: string,
  updates: Partial<Pick<Badge, 'name' | 'icon' | 'type' | 'description' | 'rarity' | 'criteria'>>
): Promise<Badge | null> {
  const current = await getBadgeById(id);
  if (!current) return null;
  const name = updates.name ?? current.name;
  const icon = updates.icon ?? current.icon;
  const type = updates.type ?? current.type;
  const description = updates.description ?? current.description;
  const rarity = updates.rarity ?? current.rarity;
  const criteria = updates.criteria !== undefined ? updates.criteria : current.criteria;
  await query(
    `UPDATE badges SET name = $1, icon = $2, type = $3, description = $4, rarity = $5, criteria = $6, updated_at = NOW() WHERE id = $7`,
    [name, icon, type, description, rarity, criteria ?? null, id]
  );
  return getBadgeById(id);
}

export async function removeBadge(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM badges WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function awardBadgeToUser(badgeId: string, userId: string): Promise<Badge | null> {
  const badge = await getBadgeById(badgeId);
  if (!badge) return null;
  await query(
    `INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2) ON CONFLICT (user_id, badge_id) DO NOTHING`,
    [userId, badgeId]
  );
  return getBadgeById(badgeId);
}

export async function hasBadge(userId: string, badgeId: string): Promise<boolean> {
  const result = await query<{ n: number }>(
    `SELECT 1 AS n FROM user_badges WHERE user_id = $1 AND badge_id = $2 LIMIT 1`,
    [userId, badgeId]
  );
  return result.rows.length > 0;
}

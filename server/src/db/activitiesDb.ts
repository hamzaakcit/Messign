import { query } from './index.js';
import type { Activity } from '../types/index.js';

interface ActivityRow {
  id: string;
  user_id: string;
  type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  xp_gained: number;
  created_at: string;
}

function mapRowToActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as Activity['type'],
    message: row.message,
    metadata: row.metadata ?? undefined,
    xpGained: row.xp_gained ?? 0,
    timestamp: row.created_at,
  };
}

export async function addActivity(activity: Omit<Activity, 'id'>): Promise<Activity> {
  const result = await query<ActivityRow>(
    `INSERT INTO activities (user_id, type, message, metadata, xp_gained, created_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()))
     RETURNING id::text AS id, user_id, type, message, metadata, COALESCE(xp_gained, 0) AS xp_gained, created_at::text AS created_at`,
    [
      activity.userId,
      activity.type,
      activity.message,
      activity.metadata ? JSON.stringify(activity.metadata) : null,
      activity.xpGained ?? 0,
      activity.timestamp ?? null,
    ]
  );
  const row = result.rows[0];
  if (!row) throw new Error('Activity insert failed');
  return mapRowToActivity(row);
}

export async function getRecentActivities(limit = 20): Promise<Activity[]> {
  const result = await query<ActivityRow>(
    `SELECT id::text AS id, user_id, type, message, metadata, COALESCE(xp_gained, 0) AS xp_gained, created_at::text AS created_at
     FROM activities ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows.map(mapRowToActivity);
}

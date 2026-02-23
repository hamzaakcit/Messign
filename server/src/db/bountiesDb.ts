import { query } from './index.js';

export type BountyCategory = 'DESIGN' | 'CONTENT' | 'DEVELOPMENT' | 'DATA' | 'RESEARCH' | 'ADMIN' | 'OTHER';
export type BountyUrgency = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type BountyStatus = 'OPEN' | 'CLAIMED' | 'SUBMITTED' | 'COMPLETED' | 'EXPIRED' | 'CANCELLED';

export interface BountyRow {
  id: string;
  title: string;
  description: string;
  creator_id: string;
  category: string;
  department: string | null;
  xp_reward: number;
  estimated_minutes: number;
  urgency: string;
  status: string;
  claimed_by: string | null;
  claimed_at: string | null;
  completed_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  rating: number | null;
  expires_at: string | null;
  attachments: unknown;
  created_at: string;
  updated_at: string;
}

export interface CreateBountyInput {
  title: string;
  description: string;
  category: BountyCategory;
  department?: string | null;
  xpReward?: number;
  estimatedMinutes?: number;
  urgency?: BountyUrgency;
  expiresAt?: string | null;
  attachments?: { name: string; url: string }[];
}

export async function getBounties(filters: {
  status?: string;
  category?: string;
  urgency?: string;
}): Promise<BountyRow[]> {
  const status = filters.status ?? 'OPEN';
  let sql = `
    SELECT id, title, description, creator_id, category, department,
           COALESCE(xp_reward, 50)::int AS xp_reward, COALESCE(estimated_minutes, 60)::int AS estimated_minutes,
           urgency, status, claimed_by, claimed_at::text, completed_at::text, reviewed_at::text,
           review_note, rating, expires_at::text, COALESCE(attachments, '[]')::jsonb AS attachments,
           created_at::text, updated_at::text
    FROM bounties WHERE status = $1`;
  const params: unknown[] = [status];
  if (filters.category) {
    params.push(filters.category);
    sql += ` AND category = $${params.length}`;
  }
  if (filters.urgency) {
    params.push(filters.urgency);
    sql += ` AND urgency = $${params.length}`;
  }
  sql += ` ORDER BY CASE urgency WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END, created_at DESC`;
  const result = await query<BountyRow>(sql, params);
  return result.rows;
}

export async function getBountyById(id: string): Promise<BountyRow | null> {
  const result = await query<BountyRow>(
    `SELECT id, title, description, creator_id, category, department,
            COALESCE(xp_reward, 50)::int AS xp_reward, COALESCE(estimated_minutes, 60)::int AS estimated_minutes,
            urgency, status, claimed_by, claimed_at::text, completed_at::text, reviewed_at::text,
            review_note, rating, expires_at::text, COALESCE(attachments, '[]')::jsonb AS attachments,
            created_at::text, updated_at::text
     FROM bounties WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getBountiesByCreator(creatorId: string): Promise<BountyRow[]> {
  const result = await query<BountyRow>(
    `SELECT id, title, description, creator_id, category, department,
            COALESCE(xp_reward, 50)::int AS xp_reward, COALESCE(estimated_minutes, 60)::int AS estimated_minutes,
            urgency, status, claimed_by, claimed_at::text, completed_at::text, reviewed_at::text,
            review_note, rating, expires_at::text, COALESCE(attachments, '[]')::jsonb AS attachments,
            created_at::text, updated_at::text
     FROM bounties WHERE creator_id = $1 ORDER BY created_at DESC`,
    [creatorId]
  );
  return result.rows;
}

export async function getBountiesByClaimedBy(claimedBy: string): Promise<BountyRow[]> {
  const result = await query<BountyRow>(
    `SELECT id, title, description, creator_id, category, department,
            COALESCE(xp_reward, 50)::int AS xp_reward, COALESCE(estimated_minutes, 60)::int AS estimated_minutes,
            urgency, status, claimed_by, claimed_at::text, completed_at::text, reviewed_at::text,
            review_note, rating, expires_at::text, COALESCE(attachments, '[]')::jsonb AS attachments,
            created_at::text, updated_at::text
     FROM bounties WHERE claimed_by = $1 ORDER BY claimed_at DESC`,
    [claimedBy]
  );
  return result.rows;
}

export async function createBounty(creatorId: string, input: CreateBountyInput): Promise<BountyRow> {
  const id = `bounty-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await query(
    `INSERT INTO bounties (id, title, description, creator_id, category, department, xp_reward, estimated_minutes, urgency, expires_at, attachments)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      input.title,
      input.description,
      creatorId,
      input.category,
      input.department ?? null,
      input.xpReward ?? 50,
      input.estimatedMinutes ?? 60,
      input.urgency ?? 'NORMAL',
      input.expiresAt ?? null,
      JSON.stringify(input.attachments ?? []),
    ]
  );
  const row = await getBountyById(id);
  if (!row) throw new Error('Bounty insert failed');
  return row;
}

export async function claimBounty(id: string, userId: string): Promise<BountyRow | null> {
  const bounty = await getBountyById(id);
  if (!bounty || bounty.status !== 'OPEN' || bounty.creator_id === userId) return null;
  await query(
    `UPDATE bounties SET status = 'CLAIMED', claimed_by = $1, claimed_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [userId, id]
  );
  return getBountyById(id);
}

export async function submitBounty(id: string, userId: string): Promise<BountyRow | null> {
  const bounty = await getBountyById(id);
  if (!bounty || bounty.claimed_by !== userId || bounty.status !== 'CLAIMED') return null;
  await query(`UPDATE bounties SET status = 'SUBMITTED', updated_at = NOW() WHERE id = $1`, [id]);
  return getBountyById(id);
}

export async function reviewBounty(
  id: string,
  creatorId: string,
  approved: boolean,
  note?: string,
  rating?: number
): Promise<{ ok: boolean; message: string }> {
  const bounty = await getBountyById(id);
  if (!bounty || bounty.creator_id !== creatorId || bounty.status !== 'SUBMITTED')
    return { ok: false, message: 'Invalid bounty or status' };
  if (approved) {
    await query(
      `UPDATE bounties SET status = 'COMPLETED', completed_at = NOW(), reviewed_at = NOW(), review_note = $1, rating = $2, updated_at = NOW() WHERE id = $3`,
      [note ?? null, rating ?? null, id]
    );
    const { addEmployeeXP } = await import('./employeesDb.js');
    await addEmployeeXP(bounty.claimed_by!, bounty.xp_reward);
    return { ok: true, message: 'Bounty approved, XP awarded!' };
  }
  await query(
    `UPDATE bounties SET status = 'CLAIMED', review_note = $1, updated_at = NOW() WHERE id = $2`,
    [note ?? null, id]
  );
  return { ok: true, message: 'Submission rejected' };
}

export async function unclaimBounty(id: string, userId: string): Promise<boolean> {
  const bounty = await getBountyById(id);
  if (!bounty || bounty.claimed_by !== userId) return false;
  await query(
    `UPDATE bounties SET status = 'OPEN', claimed_by = NULL, claimed_at = NULL, updated_at = NOW() WHERE id = $1`,
    [id]
  );
  return true;
}

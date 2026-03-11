import { query } from './index.js';
import { eventBus } from '../events/index.js';

export type SprintStatus = 'ACTIVE' | 'IN_PROGRESS' | 'RESOLVED' | 'EXPIRED' | 'CANCELLED';

export interface SprintRequestRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  skills_needed: string[];
  requester_id: string;
  starts_at: string;
  ends_at: string;
  xp_reward: number;
  status: string;
  max_helpers: number;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface SprintHelperRow {
  id: string;
  sprint_id: string;
  user_id: string;
  joined_at: string;
  contribution: string | null;
  xp_earned: number;
}

export async function getActiveSprintRequests(): Promise<SprintRequestRow[]> {
  const result = await query<SprintRequestRow & { skills_needed: unknown }>(
    `SELECT id, project_id, title, description, COALESCE(skills_needed, '[]')::jsonb AS skills_needed,
            requester_id, starts_at::text, ends_at::text, COALESCE(xp_reward, 100)::int AS xp_reward,
            status, COALESCE(max_helpers, 3)::int AS max_helpers,
            resolved_at::text, resolution_note, created_at::text
     FROM sprint_requests
     WHERE status IN ('ACTIVE', 'IN_PROGRESS') AND ends_at > NOW()
     ORDER BY created_at DESC`
  );
  return result.rows.map((r) => ({ ...r, skills_needed: Array.isArray(r.skills_needed) ? r.skills_needed : [] }));
}

export async function getSprintRequestById(id: string): Promise<SprintRequestRow | null> {
  const result = await query<SprintRequestRow & { skills_needed: unknown }>(
    `SELECT id, project_id, title, description, COALESCE(skills_needed, '[]')::jsonb AS skills_needed,
            requester_id, starts_at::text, ends_at::text, COALESCE(xp_reward, 100)::int AS xp_reward,
            status, COALESCE(max_helpers, 3)::int AS max_helpers,
            resolved_at::text, resolution_note, created_at::text
     FROM sprint_requests WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...row, skills_needed: Array.isArray(row.skills_needed) ? row.skills_needed : [] };
}

export async function getSprintHelpers(sprintId: string): Promise<SprintHelperRow[]> {
  const result = await query<SprintHelperRow>(
    `SELECT id, sprint_id, user_id, joined_at::text AS joined_at, contribution,
            COALESCE(xp_earned, 0)::int AS xp_earned
     FROM sprint_helpers WHERE sprint_id = $1 ORDER BY joined_at`,
    [sprintId]
  );
  return result.rows;
}

export interface CreateSprintInput {
  projectId: string;
  title: string;
  description: string;
  skillsNeeded: string[];
  xpReward?: number;
  maxHelpers?: number;
  durationHours?: number;
}

export async function createSprintRequest(requesterId: string, input: CreateSprintInput): Promise<SprintRequestRow> {
  const id = `sprint-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const endsAt = new Date(Date.now() + (input.durationHours ?? 48) * 60 * 60 * 1000);
  await query(
    `INSERT INTO sprint_requests (id, project_id, title, description, skills_needed, requester_id, ends_at, xp_reward, max_helpers)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      input.projectId,
      input.title,
      input.description,
      JSON.stringify(input.skillsNeeded ?? []),
      requesterId,
      endsAt,
      input.xpReward ?? 100,
      input.maxHelpers ?? 3,
    ]
  );
  await query(`UPDATE projects SET needs_help = true WHERE id = $1`, [input.projectId]);
  const row = await getSprintRequestById(id);
  if (!row) throw new Error('Sprint insert failed');
  return row;
}

export async function joinSprint(sprintId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const sprint = await getSprintRequestById(sprintId);
  if (!sprint) return { ok: false, error: 'Sprint not found' };
  if (sprint.status !== 'ACTIVE') return { ok: false, error: 'Sprint is not accepting helpers' };
  const helpers = await getSprintHelpers(sprintId);
  if (helpers.length >= sprint.max_helpers) return { ok: false, error: 'Sprint is full' };
  if (sprint.requester_id === userId) return { ok: false, error: 'Cannot help your own sprint' };
  if (helpers.some((h) => h.user_id === userId)) return { ok: false, error: 'Already joined this sprint' };
  const helperId = `sprint-helper-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await query(
    `INSERT INTO sprint_helpers (id, sprint_id, user_id) VALUES ($1, $2, $3) ON CONFLICT (sprint_id, user_id) DO NOTHING`,
    [helperId, sprintId, userId]
  );
  if (helpers.length === 0) {
    await query(`UPDATE sprint_requests SET status = 'IN_PROGRESS' WHERE id = $1`, [sprintId]);
  }
  return { ok: true };
}

export async function resolveSprint(
  sprintId: string,
  requesterId: string,
  note?: string,
  helperContributions?: { userId: string; contribution?: string; xpMultiplier?: number }[]
): Promise<{ ok: boolean; error?: string }> {
  const sprint = await getSprintRequestById(sprintId);
  if (!sprint) return { ok: false, error: 'Sprint not found' };
  if (sprint.requester_id !== requesterId) return { ok: false, error: 'Only requester can resolve' };
  const helpers = await getSprintHelpers(sprintId);
  const { addEmployeeXP } = await import('./employeesDb.js');
  for (const h of helpers) {
    const contrib = helperContributions?.find((c) => c.userId === h.user_id);
    const xpEarned = Math.round(sprint.xp_reward * (contrib?.xpMultiplier ?? 1));
    await query(
      `UPDATE sprint_helpers SET contribution = $1, xp_earned = $2 WHERE id = $3`,
      [contrib?.contribution ?? null, xpEarned, h.id]
    );
    await addEmployeeXP(h.user_id, xpEarned);
  }
  await query(
    `UPDATE sprint_requests SET status = 'RESOLVED', resolved_at = NOW(), resolution_note = $1 WHERE id = $2`,
    [note ?? null, sprintId]
  );
  await query(`UPDATE projects SET needs_help = false WHERE id = $1`, [sprint.project_id]);
  eventBus.emit('project.sprint.completed', {
    sprintId,
    projectId: sprint.project_id,
    completedTasks: helpers.length,
    totalTasks: helpers.length,
  });
  return { ok: true };
}

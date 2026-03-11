import { query } from '../../db/index.js';
import { eventBus } from '../../events/index.js';
import type { CallerContext } from '../types.js';
import { createEntry, type TimeEntry } from './entries.js';

export interface Timer {
  id: string;
  organization_id: string;
  user_id: string;
  project_id: string | null;
  task_id: string | null;
  category_id: string | null;
  description: string | null;
  is_billable: boolean;
  started_at: string;
  stopped_at: string | null;
  duration_seconds: number | null;
  is_active: boolean;
  created_at: string;
}

function mapTimer(row: Record<string, unknown>): Timer {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    user_id: String(row.user_id),
    project_id: row.project_id ? String(row.project_id) : null,
    task_id: row.task_id ? String(row.task_id) : null,
    category_id: row.category_id ? String(row.category_id) : null,
    description: row.description ? String(row.description) : null,
    is_billable: Boolean(row.is_billable),
    started_at: String(row.started_at),
    stopped_at: row.stopped_at ? String(row.stopped_at) : null,
    duration_seconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
  };
}

function roundToQuarterHours(durationSeconds: number): number {
  const quarter = 0.25;
  const hours = durationSeconds / 3600;
  return Math.max(quarter, Math.round(hours / quarter) * quarter);
}

export async function getActiveTimer(ctx: CallerContext): Promise<Timer | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT
       id::text AS id,
       organization_id::text AS organization_id,
       user_id::text AS user_id,
       project_id,
       task_id,
       category_id::text AS category_id,
       description,
       is_billable,
       started_at::text AS started_at,
       stopped_at::text AS stopped_at,
       duration_seconds,
       is_active,
       created_at::text AS created_at
     FROM time_timers
     WHERE organization_id = $1::uuid
       AND user_id = $2::uuid
       AND is_active = TRUE
     ORDER BY started_at DESC
     LIMIT 1`,
    [ctx.organizationId, ctx.userId],
  );
  return result.rows[0] ? mapTimer(result.rows[0]) : null;
}

export async function startTimer(
  ctx: CallerContext,
  data: { projectId?: string; taskId?: string; categoryId?: string; description?: string; isBillable?: boolean },
): Promise<Timer> {
  if (!ctx.organizationId) throw new Error('organizationId is required');
  const active = await getActiveTimer(ctx);
  if (active) {
    await stopTimer(ctx, active.id);
  }

  const result = await query<Record<string, unknown>>(
    `INSERT INTO time_timers (
      organization_id, user_id, project_id, task_id, category_id, description, is_billable, started_at, is_active
    )
    VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6, $7, NOW(), TRUE)
    RETURNING
      id::text AS id,
      organization_id::text AS organization_id,
      user_id::text AS user_id,
      project_id,
      task_id,
      category_id::text AS category_id,
      description,
      is_billable,
      started_at::text AS started_at,
      stopped_at::text AS stopped_at,
      duration_seconds,
      is_active,
      created_at::text AS created_at`,
    [
      ctx.organizationId,
      ctx.userId,
      data.projectId ?? null,
      data.taskId ?? null,
      data.categoryId ?? null,
      data.description ?? null,
      Boolean(data.isBillable),
    ],
  );

  const timer = mapTimer(result.rows[0]);
  eventBus.emit('time.timer.started', {
    timerId: timer.id,
    userId: timer.user_id,
    projectId: timer.project_id ?? undefined,
    taskId: timer.task_id ?? undefined,
    startedAt: timer.started_at,
  });
  return timer;
}

export async function stopTimer(ctx: CallerContext, timerId: string): Promise<{ timer: Timer; entry?: TimeEntry }> {
  const timerResult = await query<Record<string, unknown>>(
    `SELECT
       id::text AS id,
       organization_id::text AS organization_id,
       user_id::text AS user_id,
       project_id,
       task_id,
       category_id::text AS category_id,
       description,
       is_billable,
       started_at::text AS started_at,
       stopped_at::text AS stopped_at,
       duration_seconds,
       is_active,
       created_at::text AS created_at
     FROM time_timers
     WHERE id = $1::uuid
       AND organization_id = $2::uuid
       AND user_id = $3::uuid
     LIMIT 1`,
    [timerId, ctx.organizationId, ctx.userId],
  );
  if (!timerResult.rows[0]) throw new Error('Timer not found');
  const existing = mapTimer(timerResult.rows[0]);
  if (!existing.is_active) {
    return { timer: existing };
  }

  const stopResult = await query<Record<string, unknown>>(
    `UPDATE time_timers
     SET stopped_at = NOW(),
         duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::int,
         is_active = FALSE
     WHERE id = $1::uuid
     RETURNING
       id::text AS id,
       organization_id::text AS organization_id,
       user_id::text AS user_id,
       project_id,
       task_id,
       category_id::text AS category_id,
       description,
       is_billable,
       started_at::text AS started_at,
       stopped_at::text AS stopped_at,
       duration_seconds,
       is_active,
       created_at::text AS created_at`,
    [timerId],
  );
  const timer = mapTimer(stopResult.rows[0]);
  const durationSeconds = timer.duration_seconds ?? 0;

  let entry: TimeEntry | undefined;
  if (durationSeconds >= 60) {
    entry = await createEntry(ctx, {
      date: new Date(timer.started_at).toISOString().slice(0, 10),
      hours: roundToQuarterHours(durationSeconds),
      description: timer.description ?? undefined,
      isBillable: timer.is_billable,
      projectId: timer.project_id ?? undefined,
      taskId: timer.task_id ?? undefined,
      categoryId: timer.category_id ?? undefined,
      source: 'timer',
      timerId: timer.id,
    });
  }

  eventBus.emit('time.timer.stopped', {
    timerId: timer.id,
    userId: timer.user_id,
    durationMinutes: Math.round(durationSeconds / 60),
    autoCreatedEntryId: entry?.id,
  });
  return { timer, entry };
}

export async function discardTimer(ctx: CallerContext, timerId: string): Promise<void> {
  await query(
    `UPDATE time_timers
     SET stopped_at = NOW(),
         duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::int,
         is_active = FALSE
     WHERE id = $1::uuid
       AND organization_id = $2::uuid
       AND user_id = $3::uuid`,
    [timerId, ctx.organizationId, ctx.userId],
  );
}

export async function getTimerDuration(timerId: string): Promise<number> {
  const result = await query<{ duration_seconds: string }>(
    `SELECT
      CASE
        WHEN is_active THEN EXTRACT(EPOCH FROM (NOW() - started_at))::int::text
        ELSE COALESCE(duration_seconds, 0)::text
      END AS duration_seconds
     FROM time_timers
     WHERE id = $1::uuid
     LIMIT 1`,
    [timerId],
  );
  return Number(result.rows[0]?.duration_seconds ?? 0);
}

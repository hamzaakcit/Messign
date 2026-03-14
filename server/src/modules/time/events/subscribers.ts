import type { EventBus } from '../../../platform/eventBus.js';
import { crossModuleQueue, gamificationQueue } from '../../../queue/index.js';
import { query } from '../../../db/index.js';
import * as doraInsights from '../../../dal/doraInsights.js';

async function findManagerId(userId: string): Promise<string | null> {
  const result = await query<{ manager_id: string | null }>(
    `SELECT manager_id::text AS manager_id FROM reimbursement_users WHERE id = $1::uuid LIMIT 1`,
    [userId],
  );
  return result.rows[0]?.manager_id ?? null;
}

export function registerTimeEventHandlers(eventBus: EventBus): void {
  eventBus.on('time.timesheet.approved', async (payload) => {
    const groups = await query<{ client_id: string; user_id: string; period_start: string; period_end: string; entries: unknown }>(
      `SELECT te.client_id::text AS client_id, ts.user_id::text AS user_id, ts.week_start_date::text AS period_start, ts.week_end_date::text AS period_end,
        jsonb_agg(jsonb_build_object('description', COALESCE(te.description, t.title, p.name, 'Time entry'), 'hours', te.hours, 'rate', COALESCE(te.billing_rate, 0), 'amount', te.billable_amount) ORDER BY te.date ASC, te.created_at ASC) AS entries
       FROM time_entries te JOIN time_timesheets ts ON ts.id = te.timesheet_id LEFT JOIN tasks t ON t.id = te.task_id LEFT JOIN projects p ON p.id = te.project_id
       WHERE te.timesheet_id = $1::uuid AND te.is_billable = TRUE AND te.client_id IS NOT NULL
       GROUP BY te.client_id, ts.user_id, ts.week_start_date, ts.week_end_date`,
      [payload.timesheetId],
    );
    for (const row of groups.rows) {
      await crossModuleQueue.add('generate_invoice_from_time', { type: 'generate_invoice_from_time', payload: { clientId: row.client_id, entries: row.entries, timesheetId: payload.timesheetId, userId: row.user_id, period: { start: row.period_start, end: row.period_end } }, sourceEvent: 'time.timesheet.approved' });
    }
  });

  eventBus.on('time.entry.created', async (payload) => {
    if (payload.taskId) {
      const result = await query<{ actual_hours: string; project_id: string }>(`SELECT COALESCE(SUM(te.hours), 0)::float::text AS actual_hours, COALESCE(MAX(te.project_id), '') AS project_id FROM time_entries te WHERE te.task_id = $1`, [payload.taskId]);
      const actualHours = Number(result.rows[0]?.actual_hours ?? 0);
      const projectId = result.rows[0]?.project_id;
      await query(`UPDATE tasks SET actual_hours = $2 WHERE id = $1`, [payload.taskId, actualHours]);
      eventBus.emit('project.task.effort_updated', { taskId: payload.taskId, projectId: projectId || (payload.projectId ?? ''), actualHours: Number(actualHours.toFixed(2)) });
    }
    await gamificationQueue.add('time_entry_xp', { type: 'award_xp', userId: payload.userId, amount: 2, reason: 'Logged time entry' });
  });

  eventBus.on('time.overtime.detected', async (payload) => {
    const managerId = await findManagerId(payload.userId);
    if (managerId) {
      await doraInsights.createInsight({ module: 'time', severity: 'warning', title: 'Overtime detected', message: `Team member logged ${payload.weeklyHours}h this week, above the ${payload.threshold}h threshold.`, sourceEvent: 'time.overtime.detected', sourceEntityType: 'timesheet', sourceEntityId: payload.userId, targetUserId: managerId, metadata: { weeklyHours: payload.weeklyHours, threshold: payload.threshold, weekStartDate: payload.weekStartDate } });
    }
    await doraInsights.createInsight({ module: 'time', severity: 'warning', title: 'You are over weekly hour target', message: `You've logged ${payload.weeklyHours}h this week. Consider delegating or rescheduling non-critical tasks.`, sourceEvent: 'time.overtime.detected', sourceEntityType: 'timesheet', sourceEntityId: payload.userId, targetUserId: payload.userId, metadata: { weeklyHours: payload.weeklyHours, threshold: payload.threshold, weekStartDate: payload.weekStartDate } });
  });

  eventBus.on('time.utilization.threshold', async (payload) => {
    if (!payload.isBelow) return;
    const managerId = await findManagerId(payload.userId);
    if (!managerId) return;
    await doraInsights.createInsight({ module: 'time', severity: 'info', title: 'Utilization below target', message: `A team member is at ${payload.currentUtilization}% utilization, below the ${payload.targetUtilization}% target.`, sourceEvent: 'time.utilization.threshold', sourceEntityType: 'utilization', sourceEntityId: payload.userId, targetUserId: managerId, metadata: { period: payload.period, currentUtilization: payload.currentUtilization, targetUtilization: payload.targetUtilization } });
  });

  console.log('[Time] Event handlers registered');
}

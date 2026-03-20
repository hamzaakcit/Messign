/**
 * Event-driven marketing automation: enqueue jobs from triggers; worker creates draft content + approval row.
 */
import { query } from '../../db/index.js';
import { crossModuleQueue } from '../../queue/index.js';
import type { CallerContext } from '../../dal/types.js';
import { createContent } from '../../dal/marketing/content.js';
import { upsertApprovalQueue } from '../../dal/marketing/approvalsQueue.js';

export interface ProjectTaskCompletedPayload {
  taskId: string;
  projectId: string;
  completedBy: string;
  xpAwarded?: number;
}

async function resolveOrganizationIdForUser(userId: string): Promise<string | null> {
  const r = await query<{ organization_id: string }>(
    `SELECT organization_id::text AS organization_id FROM reimbursement_users
     WHERE id::text = $1 OR auth_user_id = $1 LIMIT 1`,
    [userId],
  );
  return r.rows[0]?.organization_id ?? null;
}

async function getTaskAndProjectTitle(taskId: string, projectId: string): Promise<{ taskTitle: string; projectName: string }> {
  const r = await query<{ task_title: string; project_name: string }>(
    `SELECT t.title AS task_title, p.name AS project_name
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE t.id = $1 AND t.project_id = $2 LIMIT 1`,
    [taskId, projectId],
  );
  const row = r.rows[0];
  return {
    taskTitle: row?.task_title ?? 'Completed task',
    projectName: row?.project_name ?? 'Project',
  };
}

/** Called from marketing event subscriber when triggers match. */
export async function enqueueMarketingAutomationForProjectTaskCompleted(
  payload: ProjectTaskCompletedPayload,
): Promise<void> {
  const organizationId = await resolveOrganizationIdForUser(payload.completedBy);
  if (!organizationId) return;

  const tr = await query<{ id: string }>(
    `SELECT id::text FROM marketing_automation_triggers
     WHERE organization_id = $1::uuid AND enabled = true
       AND trigger_type = 'event'
       AND COALESCE(trigger_config->>'event_name','') = 'project.task.completed'`,
    [organizationId],
  );

  for (const row of tr.rows) {
    const dedupeId = `mkt-auto-${row.id}-${payload.taskId}`;
    await crossModuleQueue.add(
      'marketing_automation_case_study_draft',
      {
        type: 'marketing_automation_case_study_draft',
        payload: {
          triggerId: row.id,
          organizationId,
          taskId: payload.taskId,
          projectId: payload.projectId,
          completedBy: payload.completedBy,
        },
        sourceEvent: 'project.task.completed',
      },
      { jobId: dedupeId, removeOnComplete: true },
    );
  }
}

/** Worker: create draft marketing content + pending approval queue row. */
export async function runMarketingAutomationCaseStudyDraft(payload: Record<string, unknown>): Promise<void> {
  const organizationId = payload.organizationId as string | undefined;
  const taskId = payload.taskId as string | undefined;
  const projectId = payload.projectId as string | undefined;
  const userId = payload.completedBy as string | undefined;
  if (!organizationId || !taskId || !projectId || !userId) {
    console.warn('[MarketingAutomation] case_study_draft: missing fields', payload);
    return;
  }

  const ctx: CallerContext = {
    userId,
    role: 'manager',
    organizationId,
  };

  const { taskTitle, projectName } = await getTaskAndProjectTitle(taskId, projectId);
  const title = `Case study teaser: ${projectName} — ${taskTitle}`.slice(0, 480);
  const body = [
    `[Autonomous draft — review before publishing]`,
    ``,
    `We shipped **${taskTitle}** in **${projectName}**.`,
    ``,
    `Suggested next steps: add customer quote, metrics, and CTA. Edit in the Marketing hub.`,
  ].join('\n');

  const content = await createContent(ctx, {
    title,
    content_type: 'blog',
    channel: 'blog',
    status: 'in_review',
    body,
    author_id: userId,
    tags: ['automation', 'case_study_teaser'],
  });

  await upsertApprovalQueue(ctx, {
    content_id: content.id,
    truth_validation: { skipped: true, reason: 'automation_draft' },
    brand_voice_check: null,
    compliance_scan: null,
  });

  console.log(`[MarketingAutomation] Draft content ${content.id} + approval queue for task ${taskId}`);
}

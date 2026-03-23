/**
 * Runs marketing automation actions (content creation, notifications) and logs runs.
 */
import type { CallerContext } from '../../../dal/types.js';
import * as contentDal from '../../../dal/marketing/content.js';
import * as automationDal from '../../../dal/marketing/automations.js';
import type { Automation } from '../../../dal/marketing/automations.js';
import { eventBus } from '../../../events/index.js';
import type { DoraRequestContext, DoraUserContext } from '../dora/types.js';
import type { ToolContext } from '../types.js';
import { buildAgentContextFromDora } from '../agents/orchestrator.js';
import {
  contentTypeForMarketingChannel,
  executeContentWorkflow,
  inferMarketingContentChannel,
  type MarketingOrchestrationContext,
} from './marketingAgentOrchestrator.js';
import { repurposeContent } from './repurposeService.js';

export interface AutomationActor {
  organizationId: string;
  reimbursementUserId: string;
  authUserId: string;
  userName: string;
  role: string;
}

export function resolveTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_full, path: string) => {
    const parts = path.split('.');
    let val: unknown = data;
    for (const p of parts) {
      if (val == null || typeof val !== 'object') return `{{${path}}}`;
      val = (val as Record<string, unknown>)[p];
    }
    if (val === undefined) return `{{${path}}}`;
    return String(val);
  });
}

function mapCallerRole(role: string): CallerContext['role'] {
  const r = role.toLowerCase();
  if (r === 'admin') return 'system_admin';
  if (r === 'finance' || r === 'finance_admin') return 'finance_admin';
  if (r === 'manager' || r === 'dept_head' || r === 'cpo') return 'manager';
  return 'employee';
}

function toDoraUserRole(role: string): DoraUserContext['userRole'] {
  const r = role.toLowerCase();
  if (r === 'admin') return 'admin';
  if (r === 'manager' || r === 'dept_head' || r === 'cpo') return 'manager';
  if (r === 'hr') return 'hr';
  if (r === 'finance' || r === 'finance_admin') return 'finance';
  return 'employee';
}

function buildOrchestrationContext(actor: AutomationActor, traceId: string): MarketingOrchestrationContext {
  const legacy: ToolContext = {
    userId: actor.authUserId,
    userUuid: actor.reimbursementUserId,
    userRole: actor.role,
    organizationId: actor.organizationId,
    userName: actor.userName,
  };

  const doraCtx: DoraRequestContext = {
    user: {
      userId: actor.authUserId,
      userUuid: actor.reimbursementUserId,
      userName: actor.userName,
      userRole: toDoraUserRole(actor.role),
      organizationId: actor.organizationId,
      department: '',
      teamId: null,
      knowledgeRole: null,
      level: '',
      mpPoints: 0,
    },
    page: { currentPath: '/marketing/agent', currentModule: 'marketing' },
    timestamp: new Date().toISOString(),
    todayDate: new Date().toISOString().slice(0, 10),
    conciseMode: false,
    requestMeta: { traceId },
  };

  const agentContext = buildAgentContextFromDora(doraCtx, legacy, traceId, '/marketing/agent');

  return {
    agentContext,
    doraCtx,
    legacyContext: legacy,
  };
}

export function callerFromActor(actor: AutomationActor): CallerContext {
  return {
    userId: actor.reimbursementUserId,
    userUuid: actor.reimbursementUserId,
    role: mapCallerRole(actor.role),
    organizationId: actor.organizationId,
  };
}

async function runCreateContent(
  automation: Automation,
  actor: AutomationActor,
  triggerData: Record<string, unknown>,
  action: { type?: string; config?: Record<string, unknown> },
): Promise<{ contentIds: string[]; error?: string }> {
  const cfg = action.config ?? {};
  const rawPrompt = typeof cfg.prompt === 'string' ? cfg.prompt : '';
  const templateData: Record<string, unknown> = {
    event: triggerData,
    ...triggerData,
  };
  const userQuery = resolveTemplate(rawPrompt, templateData);
  if (!userQuery.trim()) {
    return { contentIds: [], error: 'create_content: empty prompt' };
  }

  const channel =
    typeof cfg.channel === 'string' && cfg.channel.trim()
      ? cfg.channel.trim()
      : inferMarketingContentChannel(userQuery);
  const contentType = contentTypeForMarketingChannel(channel);
  const orchCtx = buildOrchestrationContext(actor, `automation-${automation.id}-content`);

  const result = await executeContentWorkflow(
    {
      userQuery,
      title: typeof cfg.title === 'string' ? cfg.title : undefined,
      channel,
      contentType,
    },
    orchCtx,
  );

  const contentIds: string[] = [];
  if (result.status === 'completed') {
    contentIds.push(result.contentId);
  } else if (result.contentId) {
    contentIds.push(result.contentId);
  }

  if (result.status !== 'completed' && !result.contentId) {
    return { contentIds, error: result.reason || 'content workflow failed' };
  }

  const primaryId = result.status === 'completed' ? result.contentId : result.contentId!;
  const caller = callerFromActor(actor);
  const rawRepurpose = cfg.auto_repurpose;
  const targets = Array.isArray(rawRepurpose)
    ? rawRepurpose.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    : [];

  if (targets.length > 0) {
    const source = await contentDal.getContentById(caller, primaryId);
    if (source) {
      const rep = await repurposeContent({
        ctx: caller,
        sourceContent: source,
        targetChannels: targets,
        styleHints: {},
      });
      for (const v of rep.variants) {
        contentIds.push(v.content_id);
      }
    }
  }

  return { contentIds };
}

function runSendNotification(actor: AutomationActor, action: { config?: Record<string, unknown> }): void {
  const msg =
    typeof action.config?.message === 'string' ? action.config.message : 'Marketing automation notification';
  eventBus.emit('system.notification.created', {
    userId: actor.authUserId,
    type: 'marketing_automation',
    title: msg.slice(0, 120),
    link: '/marketing/command-center?tab=automations',
  });
}

/**
 * Executes a single automation definition for the given org and trigger payload.
 */
export async function executeAutomation(event: {
  automationId: string;
  orgId: string;
  actor: AutomationActor;
  triggerType: string;
  triggerData: Record<string, unknown>;
  /** When false, skip enabled check (manual fire from API). */
  respectEnabled?: boolean;
}): Promise<{ status: string; contentIds: string[]; error?: string }> {
  const started = Date.now();
  const caller = callerFromActor(event.actor);

  const automation = await automationDal.getAutomationById(caller, event.automationId);
  if (!automation) {
    return { status: 'failed', contentIds: [], error: 'Automation not found' };
  }

  const shouldRun =
    event.respectEnabled === false ? true : automation.enabled;
  if (!shouldRun) {
    const runId = await automationDal.recordRun(caller, {
      automation_id: event.automationId,
      trigger_event: event.triggerData,
      actions_executed: [],
      content_ids: [],
      status: 'skipped',
      error: 'Automation disabled',
      duration_ms: Date.now() - started,
    });
    void runId;
    return { status: 'skipped', contentIds: [] };
  }

  const actions = Array.isArray(automation.actions) ? automation.actions : [];
  const contentIds: string[] = [];
  const executed: unknown[] = [];
  let lastError: string | undefined;

  for (const raw of actions) {
    const action = raw as { type?: string; config?: Record<string, unknown> };
    const t = action.type;
    try {
      if (t === 'create_content') {
        const r = await runCreateContent(automation, event.actor, event.triggerData, action);
        const ok = r.contentIds.length > 0;
        executed.push({ type: t, ok, detail: r });
        contentIds.push(...r.contentIds);
        if (r.error) lastError = r.error;
      } else if (t === 'send_notification') {
        runSendNotification(event.actor, action);
        executed.push({ type: t, ok: true });
      } else {
        const err = `unknown action: ${String(t ?? '')}`;
        lastError = err;
        executed.push({ type: t ?? 'unknown', ok: false, error: err });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastError = msg;
      executed.push({ type: t ?? 'unknown', ok: false, error: msg });
    }
  }

  let runStatus: automationDal.AutomationRunStatus = 'success';
  if (actions.length === 0) {
    runStatus = 'skipped';
  } else if (lastError) {
    runStatus = contentIds.length > 0 ? 'partial' : 'failed';
  }

  await automationDal.recordRun(caller, {
    automation_id: event.automationId,
    trigger_event: event.triggerData,
    actions_executed: executed,
    content_ids: contentIds,
    status: runStatus,
    error: lastError ?? null,
    duration_ms: Date.now() - started,
  });

  if (runStatus !== 'skipped') {
    await automationDal.updateAutomation(caller, event.automationId, {
      last_fired_at: new Date().toISOString(),
      fire_count: automation.fire_count + 1,
      last_error: lastError ?? null,
    });
  }

  return {
    status: runStatus,
    contentIds,
    error: lastError,
  };
}

/** Resolve {@link AutomationActor} from DB when only org + automation row exist (event-driven). */
export async function resolveActorForOrg(
  orgId: string,
  createdBy: string | null,
): Promise<AutomationActor | null> {
  const row = await automationDal.getAutomationActorRow(orgId, createdBy);
  if (!row) return null;
  return {
    organizationId: orgId,
    reimbursementUserId: row.id,
    authUserId: row.auth_user_id || row.id,
    userName: row.full_name,
    role: row.role,
  };
}

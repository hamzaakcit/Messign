/**
 * Subscribes to platform events and runs marketing automations with trigger_type = event.
 */
import { eventBus } from '../../../events/index.js';
import type { EventName } from '../../../events/eventTypes.js';
import * as automationDal from '../../../dal/marketing/automations.js';
import { callerFromActor, executeAutomation, resolveActorForOrg } from './automationExecutor.js';

const EVENT_TYPES: EventName[] = [
  'project.task.completed',
  'project.task.created',
  'crm.deal.closed',
  'crm.deal.created',
  'support.ticket.resolved',
  'hr.employee.onboarded',
  'okr.goal.completed',
  'marketing.content.published',
];

function orgIdFromPayload(payload: Record<string, unknown>): string | null {
  const o =
    payload.organizationId ??
    payload.orgId ??
    payload.tenantId ??
    (payload as { tenant_id?: string }).tenant_id;
  return typeof o === 'string' && o ? o : null;
}

function filterMatches(filter: Record<string, unknown>, payload: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([k, v]) => {
    const pv = payload[k];
    if (v === null || v === undefined) return pv === v;
    return pv === v;
  });
}

export function registerMarketingAutomationListeners(): void {
  for (const eventType of EVENT_TYPES) {
    eventBus.on(eventType, (payload: Record<string, unknown>) => {
      void (async () => {
        const orgId = orgIdFromPayload(payload);
        if (!orgId) return;

        const probe = await resolveActorForOrg(orgId, null);
        if (!probe) {
          console.warn('[AUTOMATION] No actor user for org; skipping event', eventType);
          return;
        }

        const caller = callerFromActor(probe);

        let automations: automationDal.Automation[];
        try {
          automations = await automationDal.listAutomations(caller, {
            trigger_type: 'event',
            enabled: true,
          });
        } catch (e) {
          console.warn('[AUTOMATION] listAutomations failed:', e);
          return;
        }

        for (const a of automations) {
          const cfg = a.trigger_config as Record<string, unknown>;
          if (cfg.event_name !== eventType) continue;

          if (cfg.filter && typeof cfg.filter === 'object' && cfg.filter !== null) {
            if (!filterMatches(cfg.filter as Record<string, unknown>, payload)) continue;
          }

          const actorForRun = (await resolveActorForOrg(orgId, a.created_by)) ?? probe;

          console.log('[AUTOMATION] Firing:', a.name, 'for:', eventType);

          executeAutomation({
            automationId: a.id,
            orgId,
            actor: actorForRun,
            triggerType: 'event',
            triggerData: { event_name: eventType, ...payload },
            respectEnabled: true,
          }).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[AUTOMATION] Failed:', a.name, msg);
          });
        }
      })();
    });
  }

  console.log('[AUTOMATION-LISTENER] Registered for', EVENT_TYPES.length, 'event types');
}

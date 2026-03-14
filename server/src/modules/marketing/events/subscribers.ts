import type { EventBus } from '../../../platform/eventBus.js';
import { crossModuleQueue, gamificationQueue, notificationQueue } from '../../../queue/index.js';
import { query } from '../../../db/index.js';
import * as doraInsights from '../../../dal/doraInsights.js';
import * as marketingLeads from '../../../dal/marketing/leads.js';

interface LeadMeta {
  id: string;
  organization_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  source: string;
  campaign_id: string | null;
  campaign_name: string | null;
  campaign_owner_id: string | null;
  score: number;
  status: string;
}

interface CampaignMeta {
  id: string;
  organization_id: string;
  name: string;
  owner_id: string | null;
}

async function getLeadMeta(leadId: string): Promise<LeadMeta | null> {
  const result = await query<LeadMeta>(
    `SELECT l.id::text, l.organization_id::text, l.email, l.first_name, l.last_name, l.company_name, l.source, l.campaign_id::text, c.name AS campaign_name, c.owner_id::text AS campaign_owner_id, l.score, l.status
     FROM marketing_leads l LEFT JOIN marketing_campaigns c ON c.id = l.campaign_id WHERE l.id = $1 LIMIT 1`,
    [leadId],
  );
  return result.rows[0] ?? null;
}

async function getCampaignMeta(campaignId: string): Promise<CampaignMeta | null> {
  const result = await query<CampaignMeta>(`SELECT id::text, organization_id::text, name, owner_id::text FROM marketing_campaigns WHERE id = $1 LIMIT 1`, [campaignId]);
  return result.rows[0] ?? null;
}

async function findFallbackUserId(organizationId: string, preferredUserId?: string | null): Promise<string | null> {
  if (preferredUserId) return preferredUserId;
  const result = await query<{ id: string }>(`SELECT id::text FROM reimbursement_users WHERE organization_id = $1::uuid ORDER BY created_at ASC LIMIT 1`, [organizationId]);
  return result.rows[0]?.id ?? null;
}

async function getDealOwnerId(dealId: string): Promise<string | null> {
  const result = await query<{ owner_id: string | null }>(`SELECT owner_id::text AS owner_id FROM crm_deals WHERE id = $1::uuid LIMIT 1`, [dealId]);
  return result.rows[0]?.owner_id ?? null;
}

async function getSpendMeta(campaignId: string, amount: number, date: string, category: string): Promise<{ description: string | null } | null> {
  const result = await query<{ description: string | null }>(
    `SELECT description FROM marketing_campaign_spend WHERE campaign_id = $1::uuid AND amount = $2 AND date = $3::date AND COALESCE(category, 'other') = COALESCE($4, 'other') ORDER BY created_at DESC LIMIT 1`,
    [campaignId, amount, date, category],
  );
  return result.rows[0] ?? null;
}

function leadDisplayName(lead: LeadMeta): string {
  const full = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
  return full || lead.email;
}

export function registerMarketingEventHandlers(eventBus: EventBus): void {
  eventBus.on('marketing.lead.captured', async (payload) => {
    const lead = await getLeadMeta(payload.leadId);
    if (!lead) return;
    if (lead.score >= 70 && lead.status !== 'qualified' && lead.status !== 'converted') {
      const actingUserId = await findFallbackUserId(lead.organization_id, lead.campaign_owner_id);
      if (actingUserId) {
        await marketingLeads.qualifyLead({ userId: actingUserId, role: 'manager', organizationId: lead.organization_id }, lead.id);
        await crossModuleQueue.add('route_marketing_lead_to_crm', { type: 'route_marketing_lead_to_crm', payload: { leadId: lead.id, organizationId: lead.organization_id, userId: actingUserId }, sourceEvent: 'marketing.lead.captured' });
      }
    }
    await doraInsights.createInsight({
      organizationId: lead.organization_id,
      module: 'marketing',
      severity: lead.score >= 70 ? 'success' : 'info',
      title: 'New lead captured',
      message: `New hot lead captured from ${lead.source}: ${leadDisplayName(lead)} at ${lead.company_name ?? 'Unknown company'}`,
      sourceEvent: 'marketing.lead.captured',
      sourceEntityType: 'lead',
      sourceEntityId: lead.id,
      targetRole: 'manager',
      metadata: { score: lead.score, source: lead.source, campaignId: lead.campaign_id },
    });
    if (lead.campaign_owner_id) {
      await gamificationQueue.add('marketing_campaign_owner_xp', { type: 'award_xp', userId: lead.campaign_owner_id, amount: 5, reason: 'Captured hot marketing lead' });
    }
  });

  eventBus.on('marketing.lead.routed_to_crm', async (payload) => {
    const lead = await getLeadMeta(payload.leadId);
    if (!lead) return;
    await doraInsights.createInsight({
      organizationId: lead.organization_id,
      module: 'sales',
      severity: 'success',
      title: 'Lead routed from Marketing',
      message: `New lead routed from Marketing: ${leadDisplayName(lead)} at ${lead.company_name ?? 'Unknown company'}. Source: ${lead.campaign_name ?? lead.source}. Score: ${lead.score}.`,
      sourceEvent: 'marketing.lead.routed_to_crm',
      sourceEntityType: 'lead',
      sourceEntityId: lead.id,
      targetRole: 'manager',
      metadata: { crmDealId: payload.crmDealId, crmContactId: payload.crmContactId, pipelineId: payload.pipelineId },
    });
    const dealOwnerId = await getDealOwnerId(payload.crmDealId);
    if (dealOwnerId) {
      await notificationQueue.add('marketing_lead_routed_to_crm', { userId: dealOwnerId, type: 'marketing_lead_routed_to_crm', title: 'New lead routed from Marketing', message: `${leadDisplayName(lead)} has been converted into a CRM deal.`, link: `/crm`, channel: 'in_app' });
    }
  });

  eventBus.on('marketing.spend.recorded', async (payload) => {
    const spendMeta = await getSpendMeta(payload.campaignId, payload.amount, payload.date, payload.category);
    await crossModuleQueue.add('create_expense_from_marketing_spend', { type: 'create_expense_from_marketing_spend', payload: { campaignId: payload.campaignId, amount: payload.amount, currency: payload.currency, category: payload.category, description: spendMeta?.description ?? null, date: payload.date }, sourceEvent: 'marketing.spend.recorded' });
  });

  eventBus.on('marketing.campaign.budget_exceeded', async (payload) => {
    const campaign = await getCampaignMeta(payload.campaignId);
    if (!campaign) return;
    if (campaign.owner_id) {
      await doraInsights.createInsight({ organizationId: campaign.organization_id, module: 'marketing', severity: 'critical', title: 'Campaign over budget', message: `Campaign '${payload.name}' has exceeded its budget by ${payload.percentOver}%.`, sourceEvent: 'marketing.campaign.budget_exceeded', sourceEntityType: 'campaign', sourceEntityId: payload.campaignId, targetUserId: campaign.owner_id, metadata: payload });
    }
    await doraInsights.createInsight({ organizationId: campaign.organization_id, module: 'marketing', severity: 'critical', title: 'Campaign over budget', message: `Campaign '${payload.name}' has exceeded its budget by ${payload.percentOver}%.`, sourceEvent: 'marketing.campaign.budget_exceeded', sourceEntityType: 'campaign', sourceEntityId: payload.campaignId, targetRole: 'manager', metadata: payload });
  });

  eventBus.on('marketing.campaign.completed', async (payload) => {
    const campaign = await getCampaignMeta(payload.campaignId);
    if (!campaign?.owner_id) return;
    await doraInsights.createInsight({ organizationId: campaign.organization_id, module: 'marketing', severity: payload.roi < 1 ? 'warning' : 'success', title: 'Campaign completed', message: `Campaign '${payload.name}' completed. ROI: ${payload.roi}x, ${payload.leads} leads generated.`, sourceEvent: 'marketing.campaign.completed', sourceEntityType: 'campaign', sourceEntityId: payload.campaignId, targetUserId: campaign.owner_id, metadata: payload });
  });

  eventBus.on('marketing.content.published', async (payload) => {
    await gamificationQueue.add('marketing_content_published_xp', { type: 'award_xp', userId: payload.publishedBy, amount: 5, reason: 'Published marketing content' });
  });

  console.log('[Marketing] Event handlers registered');
}

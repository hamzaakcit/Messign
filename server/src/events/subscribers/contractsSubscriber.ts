import { eventBus } from '../eventBus.js';
import { crossModuleQueue, notificationQueue } from '../../queue/index.js';
import { query } from '../../db/index.js';
import * as doraInsights from '../../dal/doraInsights.js';

interface ContractMeta {
  id: string;
  organization_id: string;
  title: string;
  counterparty_name: string;
  owner_id: string | null;
  total_value_eur: number | null;
  total_value: number | null;
  currency: string;
}

async function getContractMeta(contractId: string): Promise<ContractMeta | null> {
  const result = await query<ContractMeta>(
    `SELECT
       id::text,
       organization_id::text,
       title,
       counterparty_name,
       owner_id::text AS owner_id,
       total_value_eur,
       total_value,
       currency
     FROM contracts
     WHERE id = $1::uuid
     LIMIT 1`,
    [contractId],
  );
  return result.rows[0] ?? null;
}

export function register(): void {
  eventBus.on('contract.expiring', async (payload) => {
    const meta = await getContractMeta(payload.contractId);
    if (!meta) return;
    await doraInsights.createInsight({
      organizationId: meta.organization_id,
      module: 'contracts',
      severity: payload.daysRemaining <= 30 ? 'warning' : 'info',
      title: 'Contract expiration alert',
      message: `Contract '${payload.title}' with ${payload.counterparty} expires in ${payload.daysRemaining} days. ${payload.autoRenew ? 'Auto-renewal is ON.' : 'Action required: renew or terminate.'}`,
      sourceEvent: 'contract.expiring',
      sourceEntityType: 'contract',
      sourceEntityId: payload.contractId,
      targetRole: 'manager',
      metadata: payload,
    });
    if (meta.owner_id) {
      await notificationQueue.add('contract_expiring_owner_notice', {
        userId: meta.owner_id,
        type: 'contract_expiring',
        title: `Contract expiring: ${meta.title}`,
        message: `Expires in ${payload.daysRemaining} days. Review renewal decision.`,
        link: '/contracts/renewals',
        channel: 'in_app',
      });
    }
  });

  eventBus.on('contract.signed', async (payload) => {
    if (!payload.allPartiesSigned) return;
    const meta = await getContractMeta(payload.contractId);
    if (!meta) return;
    await doraInsights.createInsight({
      organizationId: meta.organization_id,
      module: 'contracts',
      severity: 'success',
      title: 'Contract fully executed',
      message: `Contract '${meta.title}' fully executed. All parties have signed.`,
      sourceEvent: 'contract.signed',
      sourceEntityType: 'contract',
      sourceEntityId: payload.contractId,
      targetRole: 'manager',
      metadata: payload,
    });
    await crossModuleQueue.add('create_budget_from_contract', {
      type: 'create_budget_from_contract',
      payload: {
        contractId: payload.contractId,
        value: meta.total_value_eur ?? meta.total_value ?? 0,
        period: 'monthly',
        organizationId: meta.organization_id,
        ownerId: meta.owner_id,
      },
      sourceEvent: 'contract.signed',
    });
  });

  eventBus.on('contract.compliance_due', async (payload) => {
    const meta = await getContractMeta(payload.contractId);
    if (!meta) return;
    await doraInsights.createInsight({
      organizationId: meta.organization_id,
      module: 'contracts',
      severity: 'warning',
      title: 'Contract compliance due',
      message: `Compliance obligation due in ${payload.daysRemaining} days for '${meta.title}': ${payload.description}`,
      sourceEvent: 'contract.compliance_due',
      sourceEntityType: 'contract',
      sourceEntityId: payload.contractId,
      targetRole: 'manager',
      metadata: payload,
    });
  });

  eventBus.on('contract.created', async (payload) => {
    if (payload.type !== 'vendor') return;
    const meta = await getContractMeta(payload.contractId);
    if (!meta) return;

    const vendor = await query<{ id: string }>(
      `SELECT id::text FROM finance_vendors
       WHERE organization_id = $1::uuid
         AND LOWER(name) = LOWER($2)
       LIMIT 1`,
      [meta.organization_id, meta.counterparty_name],
    );
    const company = await query<{ id: string }>(
      `SELECT id::text FROM crm_companies
       WHERE organization_id = $1::uuid
         AND LOWER(name) = LOWER($2)
       LIMIT 1`,
      [meta.organization_id, meta.counterparty_name],
    );

    await query(
      `UPDATE contracts
       SET finance_vendor_id = COALESCE(finance_vendor_id, $2::uuid),
           crm_company_id = COALESCE(crm_company_id, $3::uuid),
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [payload.contractId, vendor.rows[0]?.id ?? null, company.rows[0]?.id ?? null],
    );
  });
}

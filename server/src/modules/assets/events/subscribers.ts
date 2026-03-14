import type { EventBus } from '../../../platform/eventBus.js';
import { query } from '../../../db/index.js';
import * as doraInsights from '../../../dal/doraInsights.js';

async function getUserMeta(userId: string): Promise<{ organization_id: string; full_name: string | null; department: string | null } | null> {
  const result = await query<{ organization_id: string; full_name: string | null; department: string | null }>(
    `SELECT organization_id::text AS organization_id, full_name, department
     FROM reimbursement_users
     WHERE id = $1::uuid
     LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export function registerAssetsEventHandlers(eventBus: EventBus): void {
  eventBus.on('hr.employee.onboarded', async (payload) => {
    const user = await getUserMeta(payload.userId);
    if (!user) return;
    await doraInsights.createInsight({
      organizationId: user.organization_id,
      module: 'assets',
      severity: 'info',
      title: 'New hire equipment allocation',
      message: `New employee ${user.full_name ?? payload.userId} starting in ${user.department ?? payload.departmentId}. Standard equipment allocation needed: laptop, monitor, peripherals.`,
      sourceEvent: 'hr.employee.onboarded',
      sourceEntityType: 'employee',
      sourceEntityId: payload.userId,
      targetRole: 'manager',
      metadata: payload,
    });
  });

  eventBus.on('hr.employee.offboarded', async (payload) => {
    const user = await getUserMeta(payload.userId);
    if (!user) return;
    const assets = await query<{ names: string[]; count: string }>(
      `SELECT COALESCE(array_agg(name ORDER BY name), '{}') AS names, COUNT(*)::text AS count
       FROM assets
       WHERE assigned_to = $1::uuid
         AND status = 'assigned'`,
      [payload.userId],
    );
    const count = Number(assets.rows[0]?.count ?? 0);
    if (count === 0) return;
    const names = (assets.rows[0]?.names ?? []).slice(0, 5).join(', ');
    await doraInsights.createInsight({
      organizationId: user.organization_id,
      module: 'assets',
      severity: 'critical',
      title: 'Offboarding asset return needed',
      message: `Employee ${user.full_name ?? payload.userId} offboarded. ${count} assets need to be returned: ${names}${count > 5 ? ', ...' : ''}.`,
      sourceEvent: 'hr.employee.offboarded',
      sourceEntityType: 'employee',
      sourceEntityId: payload.userId,
      targetRole: 'manager',
      metadata: { count, names: assets.rows[0]?.names ?? [] },
    });
  });

  eventBus.on('asset.warranty_expiring', async (payload) => {
    const assetResult = await query<{ organization_id: string }>(
      `SELECT organization_id::text AS organization_id FROM assets WHERE id = $1::uuid LIMIT 1`,
      [payload.assetId],
    );
    const orgId = assetResult.rows[0]?.organization_id;
    if (!orgId) return;
    await doraInsights.createInsight({
      organizationId: orgId,
      module: 'assets',
      severity: 'warning',
      title: 'Warranty expiring soon',
      message: `Warranty expiring in ${payload.daysRemaining} days for ${payload.assetName}. Consider renewal or replacement.`,
      sourceEvent: 'asset.warranty_expiring',
      sourceEntityType: 'asset',
      sourceEntityId: payload.assetId,
      targetRole: 'manager',
      metadata: payload,
    });
  });

  eventBus.on('asset.license.underutilized', async (payload) => {
    const licenseResult = await query<{ organization_id: string }>(
      `SELECT organization_id::text AS organization_id FROM licenses WHERE id = $1::uuid LIMIT 1`,
      [payload.licenseId],
    );
    const orgId = licenseResult.rows[0]?.organization_id;
    if (!orgId) return;
    const savings = Math.max(0, payload.monthlyCost * Math.max(0, (payload.seatsPurchased - payload.seatsUsed) / Math.max(payload.seatsPurchased, 1)));
    await doraInsights.createInsight({
      organizationId: orgId,
      module: 'assets',
      severity: 'info',
      title: 'Underutilized software license',
      message: `${payload.softwareName} license at ${payload.utilizationPercent}% usage (${payload.seatsUsed}/${payload.seatsPurchased} seats). Potential monthly savings: €${savings.toFixed(2)} by downgrading.`,
      sourceEvent: 'asset.license.underutilized',
      sourceEntityType: 'license',
      sourceEntityId: payload.licenseId,
      targetRole: 'manager',
      metadata: { ...payload, savings },
    });
  });

  console.log('[Assets] Event handlers registered');
}

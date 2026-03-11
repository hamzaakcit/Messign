import { query } from '../../db/index.js';

export const ANALYTICS_VIEWS = {
  marketingRoi: 'mv_marketing_roi',
  recruitmentFunnel: 'mv_recruitment_funnel',
  assetSummary: 'mv_asset_summary',
  licenseUtilization: 'mv_license_utilization',
  contractRenewals: 'mv_contract_renewals',
} as const;

export async function refreshMaterializedViews(views: string[]): Promise<void> {
  for (const view of Array.from(new Set(views))) {
    await query(`REFRESH MATERIALIZED VIEW ${view}`);
  }
}

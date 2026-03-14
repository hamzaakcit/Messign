/**
 * Check for tables with organization_id that are NOT in the RLS migration list.
 * These tables need tenant_id added and RLS enabled.
 *
 * Run: npm run db:check-org-gaps (from server/)
 */

import 'dotenv/config';
import { pool } from '../db/index.js';

const RLS_MIGRATION_TABLES = [
  'crm_deals',
  'crm_contacts',
  'crm_companies',
  'crm_activities',
  'crm_pipelines',
  'crm_deal_stages',
  'reimbursement_settings',
  'reimbursement_requests',
  'expense_categories',
  'finance_budgets',
  'invoices',
  'marketing_campaigns',
  'marketing_leads',
  'marketing_content',
  'marketing_scoring_rules',
  'recruitment_jobs',
  'recruitment_candidates',
  'recruitment_applications',
  'recruitment_interviews',
  'support_tickets',
  'support_sla_policies',
  'support_categories',
  'support_tags',
  'time_timesheets',
  'time_entries',
  'time_categories',
  'time_timers',
  'assets',
  'asset_categories',
  'contracts',
  'licenses',
  'dora_insights',
  'dora_automation_policies',
  'dora_sessions',
  'dora_messages',
  'heart_pulse_surveys',
  'heart_pulse_responses',
  'webhooks',
  'okr_periods',
  'okr_goals',
  'entity_embeddings',
  // 004_rls_gap_fix.sql
  'budgets',
  'finance_approval_policies',
  'finance_audit_log',
  'finance_dora_decisions',
  'finance_dora_job_runs',
  'finance_expense_policies',
  'finance_gl_accounts',
  'finance_invoice_templates',
  'finance_journal_entries',
  'finance_notification_preferences',
  'finance_notifications',
  'finance_payments',
  'finance_period_closes',
  'finance_settings',
  'finance_tax_rates',
  'finance_vendors',
  'heart_team_health',
  'time_billing_rates',
  'reimbursement_users',
];

async function main() {
  console.log('\n=== Tables with organization_id NOT in RLS migration list ===\n');

  const placeholders = RLS_MIGRATION_TABLES.map((_, i) => `$${i + 1}`).join(', ');
  const result = await pool.query(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE column_name = 'organization_id'
       AND table_schema = 'public'
       AND table_name NOT IN (${placeholders})
     ORDER BY table_name`,
    RLS_MIGRATION_TABLES,
  );

  if (result.rows.length === 0) {
    console.log('No gaps found. All organization_id tables are in the RLS migration list.\n');
    return;
  }

  console.log('Tables that need tenant_id + RLS:\n');
  for (const row of result.rows) {
    console.log(`  - ${row.table_name}`);
  }
  console.log('\n');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

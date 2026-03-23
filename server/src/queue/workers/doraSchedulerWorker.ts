import { Worker, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from '../connection.js';
import { query } from '../../db/index.js';
import { doraScheduler, runSchedulerJobForAllOrgs } from '../../services/finance/doraScheduler.js';
import { generateBriefing } from '../../services/dora/dailyBriefing.js';
import { emitToUser } from '../../sockets/index.js';
import type { CallerContext } from '../../dal/types.js';
import { assessBurnoutRisk } from '../../services/dora/heart/burnoutDetector.js';
import { calculateTeamHealth } from '../../services/dora/heart/teamHealthCalculator.js';
import { generateWeeklyComposite } from '../../services/dora/heart/sentimentAnalyzer.js';
import { checkDueMilestones } from '../../services/dora/heart/onboardingGuide.js';
import { createAutoPulseSurvey } from '../../services/dora/heart/pulseSurveys.js';

const connection = redisConnection as unknown as ConnectionOptions;

interface SchedulerJob {
  type: string;
}

const MATERIALIZED_VIEWS = [
  'mv_department_spend',
  'mv_budget_health',
  'mv_approval_pipeline',
  'mv_team_performance',
  'mv_project_velocity',
  'mv_customer_health',
  'mv_pipeline_summary',
  'mv_time_utilization',
  'mv_asset_summary',
  'mv_license_utilization',
  'mv_contract_renewals',
  'mv_org_sentiment',
];

async function refreshMaterializedViews(): Promise<void> {
  const listed = await query<{ matviewname: string }>(
    `SELECT matviewname FROM pg_matviews WHERE schemaname = 'public' AND matviewname = ANY($1::text[])`,
    [MATERIALIZED_VIEWS],
  );
  const existing = new Set(listed.rows.map((r) => r.matviewname));
  const toRefresh = MATERIALIZED_VIEWS.filter((v) => existing.has(v));
  for (const v of MATERIALIZED_VIEWS) {
    if (!existing.has(v)) {
      console.log(`[DoraScheduler] Skipping refresh (matview not in DB): ${v}`);
    }
  }
  const results = await Promise.allSettled(
    toRefresh.map((view) =>
      query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`).then(() => view),
    ),
  );
  results.forEach((r, i) => {
    const view = toRefresh[i];
    if (r.status === 'fulfilled') {
      console.log(`[DoraScheduler] Refreshed ${view}`);
    } else {
      const reason = r.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      console.warn(`[DoraScheduler] Could not refresh ${view}:`, message);
    }
  });
}

const worker = new Worker<SchedulerJob>(
  'dora-scheduler',
  async (job: Job<SchedulerJob>) => {
    const { type } = job.data;
    console.log(`[DoraScheduler] Running: ${type}`);

    switch (type) {
      case 'budget_health_check':
        await runSchedulerJobForAllOrgs('checkBudgetHealth', (orgId) =>
          doraScheduler.checkBudgetHealth(orgId),
        );
        break;

      case 'sla_check':
        await runSchedulerJobForAllOrgs('checkApprovalSLAs', (orgId) =>
          doraScheduler.checkApprovalSLAs(orgId),
        );
        break;

      case 'overdue_invoice_check':
        await runSchedulerJobForAllOrgs('checkOverdueInvoices', (orgId) =>
          doraScheduler.checkOverdueInvoices(orgId),
        );
        break;

      case 'recurring_invoice_generation':
        await runSchedulerJobForAllOrgs('generateRecurringInvoices', (orgId) =>
          doraScheduler.generateRecurringInvoices(orgId),
        );
        break;

      case 'refresh_materialized_views':
        await refreshMaterializedViews();
        break;

      case 'support_sla_check':
        await runSchedulerJobForAllOrgs('checkSupportSLAs', (orgId) =>
          doraScheduler.checkSupportSLAs(orgId),
        );
        break;

      case 'customer_health_recalc':
        await runSchedulerJobForAllOrgs('recalculateCustomerHealth', (orgId) =>
          doraScheduler.recalculateCustomerHealth(orgId),
        );
        break;

      case 'support_pattern_detection':
        await runSchedulerJobForAllOrgs('detectSupportPatterns', (orgId) =>
          doraScheduler.detectSupportPatterns(orgId),
        );
        break;

      case 'utilization_check':
        await runSchedulerJobForAllOrgs('checkUtilization', (orgId) =>
          doraScheduler.checkUtilization(orgId),
        );
        break;

      case 'asset_warranty_check':
        await runSchedulerJobForAllOrgs('checkAssetWarranties', (orgId) =>
          doraScheduler.checkAssetWarranties(orgId),
        );
        break;

      case 'license_utilization_check':
        await runSchedulerJobForAllOrgs('checkLicenseUtilization', (orgId) =>
          doraScheduler.checkLicenseUtilization(orgId),
        );
        break;

      case 'contract_renewal_check':
        await runSchedulerJobForAllOrgs('checkContractRenewals', (orgId) =>
          doraScheduler.checkContractRenewals(orgId),
        );
        break;

      case 'contract_obligation_check':
        await runSchedulerJobForAllOrgs('checkContractObligations', (orgId) =>
          doraScheduler.checkContractObligations(orgId),
        );
        break;

      case 'burnout_assessment': {
        console.log('[DoraScheduler] Running weekly burnout assessments...');
        const users = await query<{ id: string }>(
          `SELECT id::text AS id FROM reimbursement_users WHERE status IS DISTINCT FROM 'inactive'`
        );
        for (const row of users.rows) {
          try {
            await assessBurnoutRisk(row.id);
          } catch (err) {
            console.warn(`[DoraScheduler] Burnout assessment failed for ${row.id}:`, err instanceof Error ? err.message : err);
          }
        }
        break;
      }

      case 'team_health_calculation': {
        console.log('[DoraScheduler] Calculating team health...');
        const orgs = await query<{ id: string }>(`SELECT id::text AS id FROM organizations LIMIT 100`);
        for (const org of orgs.rows) {
          try {
            await calculateTeamHealth('organization', undefined, org.id);
            const teams = await query<{ id: string }>(
              `SELECT id::text AS id FROM performance_teams WHERE is_active = TRUE`
            );
            for (const team of teams.rows) {
              await calculateTeamHealth('department', team.id, org.id);
            }
          } catch (err) {
            console.warn(`[DoraScheduler] Team health failed for org ${org.id}:`, err instanceof Error ? err.message : err);
          }
        }
        break;
      }

      case 'weekly_sentiment_composite': {
        console.log('[DoraScheduler] Generating weekly sentiment composites...');
        const usersWithSentiment = await query<{ user_id: string }>(
          `SELECT DISTINCT user_id::text AS user_id FROM heart_sentiment_scores WHERE analyzed_at >= NOW() - INTERVAL '7 days'`
        );
        for (const row of usersWithSentiment.rows) {
          try {
            await generateWeeklyComposite(row.user_id);
          } catch (err) {
            console.warn(`[DoraScheduler] Weekly composite failed for ${row.user_id}:`, err instanceof Error ? err.message : err);
          }
        }
        break;
      }

      case 'auto_pulse_survey': {
        console.log('[DoraScheduler] Creating auto pulse survey...');
        await createAutoPulseSurvey();
        break;
      }

      case 'onboarding_milestone_check': {
        console.log('[DoraScheduler] Checking onboarding milestones...');
        await checkDueMilestones();
        break;
      }

      case 'generate_daily_briefings': {
        console.log('[DoraScheduler] Generating daily briefings for all users...');
        const users = await query<{ id: string; role: string; organization_id: string }>(
          `SELECT id::text, role, organization_id::text
           FROM reimbursement_users
           WHERE status IS DISTINCT FROM 'inactive'`,
        );
        for (const user of users.rows) {
          const ctx: CallerContext = {
            userId: user.id,
            role: user.role as CallerContext['role'],
            organizationId: user.organization_id,
          };
          try {
            const briefing = await generateBriefing(ctx);
            await emitToUser(user.id, 'dora:briefing-ready', { date: briefing.date, generatedAt: briefing.generatedAt });
          } catch (error) {
            console.warn(`[DoraScheduler] Briefing generation failed for user ${user.id}:`, error instanceof Error ? error.message : error);
          }
        }
        break;
      }

      default:
        console.log(`[DoraScheduler] Unknown job type: ${type}`);
    }
  },
  { connection, concurrency: 1 },
);

worker.on('error', (err) => console.warn('[DoraScheduler] Worker error (Redis?):', err.message));
worker.on('completed', (job) => console.log(`[DoraScheduler] ${job.name} completed`));
worker.on('failed', (job, err) => console.error(`[DoraScheduler] ${job?.name} failed:`, err.message));

export default worker;

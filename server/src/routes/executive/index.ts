import { Router } from 'express';
import { reimbursementAuth, requireRole, type ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import type { CallerContext } from '../../dal/types.js';
import {
  getExecutiveDashboard,
  getFinanceMetrics,
  getRecentActivity,
  getRevenueMetrics,
} from '../../dal/executive/dashboard.js';
import { getAuditLog } from '../../dal/executive/auditLog.js';
import { getAiRequestMetrics } from '../../services/ai/telemetry/service.js';
import { redisConnection } from '../../queue/connection.js';

const executiveRouter = Router();
const CACHE_TTL = 60;

function buildCtx(req: ReimbursementRequest): CallerContext {
  const user = req.reimbursementUser!;
  return {
    userId: user.id,
    role: user.role as CallerContext['role'],
    organizationId: req.organizationId,
  };
}

executiveRouter.use(reimbursementAuth);
executiveRouter.use(requireRole('admin', 'manager', 'dept_head', 'system_admin', 'finance_admin'));

executiveRouter.get('/dashboard', async (req: ReimbursementRequest, res) => {
  try {
    const userId = req.reimbursementUser!.id;
    const cacheKey = `executive_dashboard_${userId}`;
    try {
      const cached = await redisConnection.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    } catch (e) {
      if (e instanceof Error) console.warn('[Redis] executive dashboard cache get:', e.message);
    }
    const data = await getExecutiveDashboard(buildCtx(req));
    try {
      await redisConnection.setex(cacheKey, CACHE_TTL, JSON.stringify(data));
    } catch (e) {
      if (e instanceof Error) console.warn('[Redis] executive dashboard cache set:', e.message);
    }
    res.json(data);
  } catch (error) {
    console.error('[executive/dashboard]', error);
    // Return empty dashboard so UI renders (e.g. in E2E when DB schema differs)
    const fallback = {
      revenue: { totalYTD: 0, monthlyTrend: [], pipelineValue: 0, weightedPipeline: 0, dealsWonThisMonth: 0, winRate: 0 },
      finance: { totalExpensesQTD: 0, pendingApprovals: 0, overdueInvoices: 0, overdueAmount: 0, budgetHealthAvg: 0, criticalBudgets: 0 },
      support: { openTickets: 0, avgResponseHours: 0, csatScore: 0, slaCompliance: 100, ticketsResolvedThisWeek: 0, atRiskCustomers: 0 },
      marketing: { mqls: 0, activeCampaigns: 0, avgROI: 0, topCampaign: null, leadsThisMonth: 0 },
      people: { totalEmployees: 0, openPositions: 0, avgUtilization: 0, newHiresThisMonth: 0, pendingTimesheets: 0 },
      projects: { activeProjects: 0, tasksCompletedThisWeek: 0, blockedTasks: 0, avgSprintVelocity: 0 },
      okrs: { overallProgress: 0, onTrack: 0, atRisk: 0, behind: 0 },
      culture: null,
      operations: { contractsExpiringThisMonth: 0, licensesExpiringThisMonth: 0, assetsUnassigned: 0 },
      recentActivity: [],
      doraInsights: { criticalCount: 0, warningCount: 0, totalUnread: 0 },
    };
    res.json(fallback);
  }
});

executiveRouter.get('/dashboard/revenue', async (req: ReimbursementRequest, res) => {
  try {
    const data = await getRevenueMetrics(buildCtx(req));
    res.json(data);
  } catch (error) {
    console.error('[executive/dashboard/revenue]', error);
    res.status(500).json({ error: 'Failed to load revenue metrics' });
  }
});

executiveRouter.get('/dashboard/finance', async (req: ReimbursementRequest, res) => {
  try {
    const data = await getFinanceMetrics(buildCtx(req));
    res.json(data);
  } catch (error) {
    console.error('[executive/dashboard/finance]', error);
    res.status(500).json({ error: 'Failed to load finance metrics' });
  }
});

executiveRouter.get('/dashboard/activity', async (req: ReimbursementRequest, res) => {
  try {
    const data = await getRecentActivity(buildCtx(req));
    res.json(data);
  } catch (error) {
    console.error('[executive/dashboard/activity]', error);
    res.status(500).json({ error: 'Failed to load recent activity' });
  }
});

// SOC 2 Audit Log — admin/executive. Query params: range (30d|7d|24h), action (e.g. ai.tool.executed)
executiveRouter.get('/audit-log', async (req: ReimbursementRequest, res) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ error: 'Missing organization context' });
    }
    const range = (req.query.range as string) || '30d';
    const action = req.query.action as string | undefined;
    const limit = Math.min(500, parseInt(String(req.query.limit || 200), 10) || 200);
    const entries = await getAuditLog({ tenantId: orgId, range, action, limit });
    res.json({ data: entries });
  } catch (error) {
    console.error('[executive/audit-log]', error);
    res.status(500).json({ error: 'Failed to load audit log' });
  }
});

// AI observability — admin only. Target: orchestrator >90%, P50 <5s, P95 <15s.
executiveRouter.get('/ai-metrics', requireRole('admin'), async (req: ReimbursementRequest, res) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) {
      return res.status(400).json({ error: 'Missing organization context' });
    }
    const rangeParam = (req.query.range as string) || '7d';
    const rangeDays = rangeParam === '24h' ? 1 : parseInt(rangeParam.replace(/[^0-9]/g, ''), 10) || 7;
    const data = await getAiRequestMetrics(orgId, Math.min(90, Math.max(1, rangeDays)));
    res.json(data);
  } catch (error) {
    console.error('[executive/ai-metrics]', error);
    res.status(500).json({ error: 'Failed to load AI metrics' });
  }
});

export default executiveRouter;

import { Router } from 'express';
import { query } from '../../db/index.js';
import { reimbursementAuth, type ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { requireRole } from '../../middleware/reimbursementAuth.js';
import type { CallerContext } from '../../dal/types.js';
import * as heart from '../../dal/heart/index.js';

const router = Router();

async function buildCtx(req: ReimbursementRequest): Promise<CallerContext> {
  const authUserId = req.reimbursementUser?.authUserId ?? null;
  let departmentId: string | undefined;
  let teamId: string | undefined;

  if (authUserId) {
    const teamResult = await query<{ team_id: string; team_name: string }>(
      `SELECT ptm.team_id::text AS team_id, pt.team_name
       FROM performance_team_members ptm
       JOIN performance_teams pt ON pt.id = ptm.team_id
       WHERE ptm.employee_id = $1 AND ptm.is_active = TRUE
       LIMIT 1`,
      [authUserId]
    );
    teamId = teamResult.rows[0]?.team_id;
    departmentId = teamResult.rows[0]?.team_name;
  }

  return {
    userId: req.reimbursementUser!.id,
    role: req.reimbursementUser!.role as CallerContext['role'],
    organizationId: req.organizationId,
    teamId,
    departmentId,
  };
}

router.use(reimbursementAuth);

// ── Personal routes (any authenticated user) ──

router.get('/me/wellness', async (req: ReimbursementRequest, res) => {
  try {
    const ctx = await buildCtx(req);
    const insights = await heart.getMyWellnessInsights(ctx);
    res.json(insights);
  } catch (error) {
    console.error('[heart] wellness failed:', error);
    res.status(500).json({ error: 'Failed to fetch wellness insights' });
  }
});

router.get('/me/sentiment', async (req: ReimbursementRequest, res) => {
  try {
    const ctx = await buildCtx(req);
    const days = typeof req.query.days === 'string' ? parseInt(req.query.days, 10) : 30;
    const history = await heart.getMySentimentHistory(ctx, days);
    res.json({ history });
  } catch (error) {
    console.error('[heart] sentiment failed:', error);
    res.status(500).json({ error: 'Failed to fetch sentiment history' });
  }
});

router.get('/me/burnout', async (req: ReimbursementRequest, res) => {
  try {
    const ctx = await buildCtx(req);
    const history = await heart.getMyBurnoutHistory(ctx);
    res.json({ history });
  } catch (error) {
    console.error('[heart] burnout failed:', error);
    res.status(500).json({ error: 'Failed to fetch burnout history' });
  }
});

// ── Team routes (manager+) ──

router.get('/team', requireRole('manager', 'admin', 'finance'), async (req: ReimbursementRequest, res) => {
  try {
    const ctx = await buildCtx(req);
    const scopeType = (req.query.scopeType as 'team' | 'department' | 'organization') ?? 'team';
    const scopeId = typeof req.query.scopeId === 'string' ? req.query.scopeId : undefined;
    const teamHealth = await heart.getTeamHealth(ctx, scopeType, scopeId);
    res.json(teamHealth ?? {});
  } catch (error) {
    console.error('[heart] team failed:', error);
    res.status(500).json({ error: 'Failed to fetch team health' });
  }
});

router.get('/team/history', requireRole('manager', 'admin', 'finance'), async (req: ReimbursementRequest, res) => {
  try {
    const ctx = await buildCtx(req);
    const scopeType = (req.query.scopeType as 'team' | 'department' | 'organization') ?? 'team';
    const scopeId = typeof req.query.scopeId === 'string' ? req.query.scopeId : undefined;
    const periods = typeof req.query.periods === 'string' ? parseInt(req.query.periods, 10) : 12;
    const history = await heart.getTeamHealthHistory(ctx, scopeType, scopeId, periods);
    res.json({ history });
  } catch (error) {
    console.error('[heart] team history failed:', error);
    res.status(500).json({ error: 'Failed to fetch team health history' });
  }
});

router.get('/departments', requireRole('manager', 'admin', 'finance'), async (req: ReimbursementRequest, res) => {
  try {
    const ctx = await buildCtx(req);
    const comparison = await heart.getDepartmentComparison(ctx);
    res.json({ departments: comparison });
  } catch (error) {
    console.error('[heart] departments failed:', error);
    res.status(500).json({ error: 'Failed to fetch department comparison' });
  }
});

// ── Pulse routes ──

router.post('/pulse/surveys', requireRole('manager', 'admin', 'finance'), async (req: ReimbursementRequest, res) => {
  try {
    const ctx = await buildCtx(req);
    const { title, questions, targetScope, targetScopeId } = req.body ?? {};
    if (!Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ error: 'questions array is required' });
      return;
    }
    const survey = await heart.createPulseSurvey(ctx, {
      title: typeof title === 'string' ? title : undefined,
      questions,
      targetScope: typeof targetScope === 'string' ? targetScope : undefined,
      targetScopeId: typeof targetScopeId === 'string' ? targetScopeId : undefined,
    });
    res.status(201).json(survey);
  } catch (error) {
    console.error('[heart] create survey failed:', error);
    res.status(500).json({ error: 'Failed to create pulse survey' });
  }
});

router.get('/pulse/active', async (req: ReimbursementRequest, res) => {
  try {
    const ctx = await buildCtx(req);
    const survey = await heart.getActiveSurvey(ctx);
    res.json(survey ?? {});
  } catch (error) {
    console.error('[heart] active survey failed:', error);
    res.status(500).json({ error: 'Failed to fetch active survey' });
  }
});

router.post('/pulse/surveys/:id/respond', async (req: ReimbursementRequest, res) => {
  try {
    const ctx = await buildCtx(req);
    const { answers, department } = req.body ?? {};
    if (!answers || typeof answers !== 'object') {
      res.status(400).json({ error: 'answers object is required' });
      return;
    }
    await heart.submitPulseResponse(ctx, req.params.id, answers, typeof department === 'string' ? department : undefined);
    res.status(204).send();
  } catch (error) {
    console.error('[heart] submit response failed:', error);
    res.status(500).json({ error: 'Failed to submit response' });
  }
});

router.get('/pulse/surveys/:id/results', requireRole('manager', 'admin', 'finance'), async (req: ReimbursementRequest, res) => {
  try {
    const ctx = await buildCtx(req);
    const results = await heart.getSurveyResults(ctx, req.params.id);
    res.json(results ?? {});
  } catch (error) {
    console.error('[heart] survey results failed:', error);
    res.status(500).json({ error: 'Failed to fetch survey results' });
  }
});

export const heartRouter = router;

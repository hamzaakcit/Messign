import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import type { CallerContext } from '../../dal/types.js';
import * as pipelinesDal from '../../dal/crm/pipelines.js';

const router = Router();

function buildCtx(req: ReimbursementRequest): CallerContext {
  const user = req.reimbursementUser!;
  return {
    userId: user.id,
    role: user.role as CallerContext['role'],
    organizationId: req.organizationId,
  };
}

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const pipelines = await pipelinesDal.listPipelines(buildCtx(req));
    res.json(pipelines);
  } catch (err) {
    console.error('[crm/pipelines GET]', err);
    res.status(500).json({ error: 'Failed to list pipelines' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const pipeline = await pipelinesDal.getPipelineById(buildCtx(req), req.params.id);
    if (!pipeline) { res.status(404).json({ error: 'Pipeline not found' }); return; }
    res.json(pipeline);
  } catch (err) {
    console.error('[crm/pipelines/:id GET]', err);
    res.status(500).json({ error: 'Failed to get pipeline' });
  }
});

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { name, description, team_id } = req.body;
    if (!name) { res.status(400).json({ error: 'Pipeline name is required' }); return; }
    const pipeline = await pipelinesDal.createPipeline(buildCtx(req), { name, description, team_id });
    res.status(201).json(pipeline);
  } catch (err) {
    console.error('[crm/pipelines POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create pipeline' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const pipeline = await pipelinesDal.updatePipeline(buildCtx(req), req.params.id, req.body);
    res.json(pipeline);
  } catch (err) {
    console.error('[crm/pipelines/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update pipeline' });
  }
});

router.put('/stages/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const stage = await pipelinesDal.updateStage(req.params.id, req.body);
    res.json(stage);
  } catch (err) {
    console.error('[crm/stages/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update stage' });
  }
});

router.put('/:id/reorder', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { stage_ids } = req.body;
    if (!Array.isArray(stage_ids) || stage_ids.length === 0) {
      res.status(400).json({ error: 'stage_ids array is required' });
      return;
    }
    await pipelinesDal.reorderStages(buildCtx(req), req.params.id, stage_ids);
    res.json({ success: true });
  } catch (err) {
    console.error('[crm/stages/reorder PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to reorder stages' });
  }
});

// ── Stages sub-routes (nested) ──

router.get('/:pipelineId/stages', async (req: ReimbursementRequest, res: Response) => {
  try {
    const stages = await pipelinesDal.listStages(req.params.pipelineId);
    res.json(stages);
  } catch (err) {
    console.error('[crm/stages GET]', err);
    res.status(500).json({ error: 'Failed to list stages' });
  }
});

router.post('/:pipelineId/stages', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { name, position, probability_default, color, is_won, is_lost } = req.body;
    if (!name) { res.status(400).json({ error: 'Stage name is required' }); return; }
    const stage = await pipelinesDal.createStage(req.params.pipelineId, { name, position, probability_default, color, is_won, is_lost });
    res.status(201).json(stage);
  } catch (err) {
    console.error('[crm/stages POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create stage' });
  }
});

router.put('/:pipelineId/stages/reorder', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { stage_ids } = req.body;
    if (!Array.isArray(stage_ids) || stage_ids.length === 0) {
      res.status(400).json({ error: 'stage_ids array is required' });
      return;
    }
    await pipelinesDal.reorderStages(buildCtx(req), req.params.pipelineId, stage_ids);
    res.json({ success: true });
  } catch (err) {
    console.error('[crm/stages/reorder PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to reorder stages' });
  }
});

router.put('/:pipelineId/stages/:stageId', async (req: ReimbursementRequest, res: Response) => {
  try {
    const stage = await pipelinesDal.updateStage(req.params.stageId, req.body);
    res.json(stage);
  } catch (err) {
    console.error('[crm/stages/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update stage' });
  }
});

router.delete('/:pipelineId/stages/:stageId', async (req: ReimbursementRequest, res: Response) => {
  try {
    await pipelinesDal.deleteStage(req.params.stageId);
    res.json({ success: true });
  } catch (err) {
    console.error('[crm/stages/:id DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete stage' });
  }
});

export default router;

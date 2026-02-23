import { Router } from 'express';
import { requireAdmin } from '../../middleware/adminAuth.js';
import {
  getAllProjectsWithApplicationCounts,
  getPendingApprovalProjects,
  getProjectByIdForAdmin,
  updateProjectAdmin,
  deleteProject,
  approveProject,
  rejectProject,
  getApplicationsByProjectId,
  acceptApplication,
  rejectApplication,
  completeProject,
  addProjectWithRecruitment,
  type RecruitmentSlot,
} from '../../db/projectsDb.js';
import { awardXP } from '../../services/gamification.js';

const router = Router();
router.use(requireAdmin);

router.get('/', async (_req, res) => {
  try {
    const projects = await getAllProjectsWithApplicationCounts();
    res.json(projects);
  } catch (e) {
    console.error('[admin/projects] GET error:', e);
    res.status(500).json({ error: 'Failed to load projects' });
  }
});

// GET /admin/projects/pending - projects awaiting approval
router.get('/pending', async (_req, res) => {
  try {
    const projects = await getPendingApprovalProjects();
    res.json(projects);
  } catch (e) {
    console.error('[admin/projects] pending error:', e);
    res.status(500).json({ error: 'Failed to load pending projects' });
  }
});

// GET /admin/projects/:id - get one project (for edit)
router.get('/:id', async (req, res) => {
  try {
    const project = await getProjectByIdForAdmin(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (e) {
    console.error('[admin/projects] get by id error:', e);
    res.status(500).json({ error: 'Failed to load project' });
  }
});

// PUT /admin/projects/:id - update project
router.put('/:id', async (req, res) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const data = {
      name: typeof body.name === 'string' ? body.name : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      type: typeof body.type === 'string' ? body.type : undefined,
      recruitment_status: typeof body.recruitment_status === 'string' ? body.recruitment_status : undefined,
      recruitment_config: Array.isArray(body.recruitment_config) ? (body.recruitment_config as RecruitmentSlot[]) : undefined,
      xp_reward: typeof body.xp_reward === 'number' ? body.xp_reward : undefined,
      is_featured: typeof body.is_featured === 'boolean' ? body.is_featured : undefined,
      due_date: body.due_date === null || (typeof body.due_date === 'string' && body.due_date.trim() === '') ? null : (typeof body.due_date === 'string' ? body.due_date : undefined),
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : undefined,
    };
    const project = await updateProjectAdmin(req.params.id, data);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (e) {
    console.error('[admin/projects] put error:', e);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /admin/projects/:id - delete project (and related records via CASCADE)
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteProject(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.status(204).send();
  } catch (e) {
    console.error('[admin/projects] delete error:', e);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// GET /admin/projects/:id/applications - applications for a project
router.get('/:id/applications', async (req, res) => {
  try {
    const applications = await getApplicationsByProjectId(req.params.id);
    res.json({ applications });
  } catch (e) {
    console.error('[admin/projects] applications error:', e);
    res.status(500).json({ error: 'Failed to load applications' });
  }
});

// POST /admin/projects/:id/approve
router.post('/:id/approve', async (req, res) => {
  try {
    const body = (req.body || {}) as { xp_reward?: number; is_featured?: boolean };
    const project = await approveProject(req.params.id, {
      xp_reward: typeof body.xp_reward === 'number' ? body.xp_reward : undefined,
      is_featured: typeof body.is_featured === 'boolean' ? body.is_featured : undefined,
    });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (e) {
    console.error('[admin/projects] approve error:', e);
    res.status(500).json({ error: 'Failed to approve project' });
  }
});

// POST /admin/projects/:id/reject
router.post('/:id/reject', async (req, res) => {
  try {
    const reason = typeof (req.body && (req.body as { reason?: string }).reason) === 'string'
      ? (req.body as { reason: string }).reason
      : 'No reason provided';
    const project = await rejectProject(req.params.id, reason);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (e) {
    console.error('[admin/projects] reject error:', e);
    res.status(500).json({ error: 'Failed to reject project' });
  }
});

// POST /admin/projects/:id/applications/:appId/accept
router.post('/:id/applications/:appId/accept', async (req, res) => {
  try {
    const ok = await acceptApplication(req.params.id, req.params.appId);
    if (!ok) {
      res.status(400).json({ error: 'Application not found, already processed, or no open slot' });
      return;
    }
    res.json({ message: 'Application accepted' });
  } catch (e) {
    console.error('[admin/projects] accept application error:', e);
    res.status(500).json({ error: 'Failed to accept application' });
  }
});

// POST /admin/projects/:id/applications/:appId/reject
router.post('/:id/applications/:appId/reject', async (req, res) => {
  try {
    const note = typeof (req.body && (req.body as { note?: string }).note) === 'string'
      ? (req.body as { note: string }).note
      : undefined;
    const ok = await rejectApplication(req.params.appId, note);
    if (!ok) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }
    res.json({ message: 'Application rejected' });
  } catch (e) {
    console.error('[admin/projects] reject application error:', e);
    res.status(500).json({ error: 'Failed to reject application' });
  }
});

// POST /admin/projects/:id/complete - mark completed and award XP to team
router.post('/:id/complete', async (req, res) => {
  try {
    const result = await completeProject(req.params.id);
    if (!result) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const { team, xpReward } = result;
    for (const userId of team) {
      await awardXP(userId, xpReward, 'Project completed');
    }
    res.json({
      message: `Project completed. ${xpReward} XP awarded to ${result.memberCount} member(s).`,
      memberCount: result.memberCount,
      xpReward,
    });
  } catch (e) {
    console.error('[admin/projects] complete error:', e);
    res.status(500).json({ error: 'Failed to complete project' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name : '';
    const description = typeof body.description === 'string' ? body.description : '';
    if (!name.trim()) {
      res.status(400).json({ error: 'Project name is required' });
      return;
    }
    const recruitmentConfig = Array.isArray(body.recruitment_config)
      ? (body.recruitment_config as RecruitmentSlot[])
      : [];
    const tags = Array.isArray(body.tags) ? (body.tags as string[]) : [];
    const project = await addProjectWithRecruitment({
      name: name.trim(),
      description: description.trim(),
      type: typeof body.type === 'string' ? body.type : undefined,
      progress: typeof body.progress === 'number' ? body.progress : undefined,
      status: typeof body.status === 'string' ? body.status : undefined,
      due_date: typeof body.due_date === 'string' ? body.due_date : undefined,
      recruitment_status: typeof body.recruitment_status === 'string' ? body.recruitment_status : undefined,
      recruitment_config: recruitmentConfig,
      xp_reward: typeof body.xp_reward === 'number' ? body.xp_reward : undefined,
      is_featured: typeof body.is_featured === 'boolean' ? body.is_featured : undefined,
      tags: tags.length > 0 ? tags : undefined,
    });
    res.status(201).json(project);
  } catch (e) {
    console.error('[admin/projects] POST error:', e);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

export const adminProjectsRouter = router;

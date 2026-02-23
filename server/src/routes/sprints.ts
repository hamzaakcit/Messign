import { Router } from 'express';
import {
  getActiveSprintRequests,
  getSprintRequestById,
  getSprintHelpers,
  createSprintRequest,
  joinSprint,
  resolveSprint,
} from '../db/sprintsDb.js';
import { getProjectById } from '../db/projectsDb.js';
import { getEmployeeByIdAsUser } from '../db/employeesDb.js';
import { requireJwt } from '../middleware/authMiddleware.js';

const router = Router();

// GET /api/sprints - List active sprint requests
router.get('/', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  try {
    const sprints = await getActiveSprintRequests();
    const withDetails = await Promise.all(
      sprints.map(async (s) => {
        const project = await getProjectById(s.project_id);
        const requester = await getEmployeeByIdAsUser(s.requester_id);
        const helpers = await getSprintHelpers(s.id);
        const helpersWithUser = await Promise.all(
          helpers.map(async (h) => {
            const user = await getEmployeeByIdAsUser(h.user_id);
            return { ...h, user: user ? { id: user.id, name: user.name, avatar: user.avatar } : { id: h.user_id, name: '', avatar: '' } };
          })
        );
        return {
          ...s,
          project: project ? { id: project.id, name: project.name, type: project.type } : { id: s.project_id, title: s.title, department: s.title },
          requester: requester ? { id: requester.id, name: requester.name, avatar: requester.avatar } : { id: s.requester_id, name: '', avatar: '' },
          helpers: helpersWithUser,
        };
      })
    );
    res.json({ sprints: withDetails });
  } catch (e) {
    console.error('[sprints] list error:', e);
    res.status(500).json({ error: 'Failed to fetch sprints' });
  }
});

// POST /api/sprints - Create sprint request
router.post('/', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  const body = req.body ?? {};
  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description : '';
  const skillsNeeded = Array.isArray(body.skillsNeeded) ? (body.skillsNeeded as string[]).filter((s) => typeof s === 'string') : [];
  if (!projectId) {
    res.status(400).json({ error: 'projectId is required' });
    return;
  }
  if (!title || title.length < 5 || title.length > 100) {
    res.status(400).json({ error: 'title must be 5-100 characters' });
    return;
  }
  if (!description || description.length < 10 || description.length > 1000) {
    res.status(400).json({ error: 'description must be 10-1000 characters' });
    return;
  }
  const project = await getProjectById(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const team = Array.isArray(project.team) ? project.team : [];
  if (!team.includes(userId)) {
    res.status(403).json({ error: 'Only project team members can request sprint support' });
    return;
  }
  const xpReward = Math.min(200, Math.max(50, Number(body.xpReward) || 100));
  const maxHelpers = Math.min(5, Math.max(1, Number(body.maxHelpers) || 3));
  const durationHours = Math.min(72, Math.max(12, Number(body.durationHours) || 48));
  try {
    const sprint = await createSprintRequest(userId, {
      projectId,
      title,
      description,
      skillsNeeded: skillsNeeded.length ? skillsNeeded : ['General'],
      xpReward,
      maxHelpers,
      durationHours,
    });
    const requester = await getEmployeeByIdAsUser(userId);
    res.status(201).json({
      sprint: {
        ...sprint,
        project: { id: project.id, name: project.name },
        requester: requester ? { id: requester.id, name: requester.name, avatar: requester.avatar } : { id: userId, name: '', avatar: '' },
      },
    });
  } catch (e) {
    console.error('[sprints] create error:', e);
    res.status(500).json({ error: 'Failed to create sprint request' });
  }
});

// POST /api/sprints/:id/join
router.post('/:id/join', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  try {
    const result = await joinSprint(req.params.id, userId);
    if (!result.ok) {
      const sprint = await getSprintRequestById(req.params.id);
      if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
      return res.status(400).json({ error: result.error ?? 'Could not join' });
    }
    res.json({ message: 'Joined sprint!' });
  } catch (e) {
    console.error('[sprints] join error:', e);
    res.status(500).json({ error: 'Failed to join sprint' });
  }
});

// POST /api/sprints/:id/resolve
router.post('/:id/resolve', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
  const helperContributions = Array.isArray(req.body?.helperContributions) ? req.body.helperContributions : undefined;
  try {
    const result = await resolveSprint(req.params.id, userId, note, helperContributions);
    if (!result.ok) {
      const sprint = await getSprintRequestById(req.params.id);
      if (!sprint) return res.status(404).json({ error: 'Sprint not found' });
      return res.status(403).json({ error: result.error ?? 'Only requester can resolve' });
    }
    res.json({ message: 'Sprint resolved! XP awarded to helpers.' });
  } catch (e) {
    console.error('[sprints] resolve error:', e);
    res.status(500).json({ error: 'Failed to resolve sprint' });
  }
});

export const sprintsRouter = router;

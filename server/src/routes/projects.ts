import { Router } from 'express';
import {
  getAllProjects,
  getProjectById,
  getActiveProjects,
  addProject,
  updateProjectProgress,
  getMarketplaceProjects,
  applyToProject,
  getProjectRecruitmentInfo,
  getRequestedDepartmentsForApply,
  addProjectWithRecruitment,
  getApplicationsByUser,
} from '../db/projectsDb.js';
import { getEmployeeById } from '../db/employeesDb.js';
import { getTasksByProject } from '../db/tasksDb.js';
import { requireJwt } from '../middleware/authMiddleware.js';

export const projectsRouter = Router();

// --- Marketplace (user-facing, requires auth) ---

// GET /api/projects/marketplace - projects where recruitment_status is recruiting or active, with user_application_status
projectsRouter.get('/marketplace', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  try {
    const projects = await getMarketplaceProjects(userId);
    res.json(projects);
  } catch (e) {
    console.error('[projects] marketplace error:', e);
    res.status(500).json({ error: 'Failed to load marketplace projects' });
  }
});

// POST /api/projects/:id/apply - apply to project
projectsRouter.post('/:id/apply', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  const projectId = req.params.id;
  const { message, slot_department } = req.body || {};
  try {
    const projectInfo = await getProjectRecruitmentInfo(projectId);
    if (!projectInfo) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (projectInfo.recruitment_status !== 'recruiting') {
      res.status(400).json({ error: 'Project is not recruiting' });
      return;
    }
    const requestedDepts = getRequestedDepartmentsForApply(projectInfo.recruitment_config);
    if (requestedDepts.length > 0) {
      const employee = await getEmployeeById(userId);
      const userDept = (employee?.department ?? '').toLowerCase().trim();
      const allowed = requestedDepts.some(
        (rd) => userDept === rd || userDept.includes(rd) || rd.includes(userDept)
      );
      if (!allowed) {
        const deptList = requestedDepts.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
        res.status(403).json({
          error: 'Only employees from the requested departments can apply to this project.',
          requestedDepartments: deptList,
        });
        return;
      }
    }
    const result = await applyToProject(projectId, userId, message ?? (slot_department ? `Slot: ${slot_department}` : undefined));
    res.json(result);
  } catch (e) {
    console.error('[projects] apply error:', e);
    res.status(500).json({ error: 'Failed to apply to project' });
  }
});

// GET /api/projects/applications/me - current user's applications
projectsRouter.get('/applications/me', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  try {
    const applications = await getApplicationsByUser(userId);
    res.json(applications);
  } catch (e) {
    console.error('[projects] applications/me error:', e);
    res.status(500).json({ error: 'Failed to load applications' });
  }
});

// POST /api/projects/create - employee propose new project (recruitment_config, status recruiting or pending_approval)
projectsRouter.post('/create', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  const isAdmin = req.role === 'admin';
  const { name, description, type, progress, due_date, recruitment_status, recruitment_config, xp_reward, is_featured, tags, opportunity_type, is_mspd, reward_currency, estimated_minutes } = req.body || {};
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  try {
    const created = await addProjectWithRecruitment({
      name,
      description: description ?? '',
      type: type ?? 'product',
      progress: progress ?? 0,
      team: [],
      capacity: { current: 0, max: 5 },
      status: 'active',
      due_date: due_date ?? null,
      recruitment_status: isAdmin ? (recruitment_status ?? 'recruiting') : 'pending_approval',
      recruitment_config: Array.isArray(recruitment_config) ? recruitment_config : [],
      xp_reward: Number(xp_reward) || 0,
      is_featured: Boolean(is_featured),
      tags: Array.isArray(tags) ? tags : [],
      opportunity_type: opportunity_type === 'side_op' ? 'side_op' : 'project',
      is_mspd: Boolean(is_mspd),
      reward_currency: reward_currency === 'MSP' ? 'MSP' : 'XP',
      estimated_minutes: estimated_minutes != null ? Number(estimated_minutes) : null,
    });
    res.status(201).json(created);
  } catch (e) {
    console.error('[projects] create (propose) error:', e);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Get all projects
projectsRouter.get('/', async (_req, res) => {
  try {
    const projects = await getAllProjects();
    res.json(projects);
  } catch (e) {
    console.error('[projects] list error:', e);
    res.status(500).json({ error: 'Failed to load projects' });
  }
});

// Get active projects
projectsRouter.get('/active', async (_req, res) => {
  try {
    const projects = await getActiveProjects();
    res.json(projects);
  } catch (e) {
    console.error('[projects] active error:', e);
    res.status(500).json({ error: 'Failed to load projects' });
  }
});

// Get project by ID with tasks
projectsRouter.get('/:id', async (req, res) => {
  try {
    const project = await getProjectById(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const tasks = await getTasksByProject(project.id);
    res.json({ ...project, tasks });
  } catch (e) {
    console.error('[projects] get error:', e);
    res.status(500).json({ error: 'Failed to load project' });
  }
});

// Create new project
projectsRouter.post('/', async (req, res) => {
  const { name, description, type, team } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  try {
    const teamArr = Array.isArray(team) ? team : ['user-1'];
    const newProject = await addProject({
      name,
      description: description ?? '',
      type: type ?? 'product',
      progress: 0,
      team: teamArr,
      capacity: { current: teamArr.length, max: 5 },
      status: 'active',
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(newProject);
  } catch (e) {
    console.error('[projects] create error:', e);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project progress
projectsRouter.patch('/:id/progress', async (req, res) => {
  const progress = Number(req.body?.progress);
  if (Number.isNaN(progress) || progress < 0 || progress > 100) {
    res.status(400).json({ error: 'progress must be 0-100' });
    return;
  }
  try {
    const project = await updateProjectProgress(req.params.id, progress);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (e) {
    console.error('[projects] progress error:', e);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

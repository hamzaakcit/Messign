import { Router } from 'express';
import {
  getShowcases,
  getShowcaseById,
  getShowcaseByProjectId,
  createShowcase,
  toggleShowcaseLike,
  toggleShowcaseFeatured,
} from '../db/showcaseDb.js';
import { getProjectById } from '../db/projectsDb.js';
import { getEmployeesByIdsAsUsers } from '../db/employeesDb.js';
import { requireJwt } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = Router();

// GET /api/showcase - Hall of Fame list
router.get('/', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  try {
    const rows = await getShowcases();
    const projects = await Promise.all(rows.map((s) => getProjectById(s.project_id)));

    const allUserIds = new Set<string>();
    projects.forEach((project) => {
      if (project && Array.isArray(project.team)) {
        project.team.slice(0, 10).forEach((uid: string) => allUserIds.add(uid));
      }
    });
    const usersMap = await getEmployeesByIdsAsUsers([...allUserIds]);

    const showcases = rows.map((s, i) => {
      const project = projects[i];
      const creatorId = project && Array.isArray(project.team) && project.team[0] ? project.team[0] : null;
      const creator = creatorId ? usersMap.get(creatorId) ?? null : null;
      const members = project && Array.isArray(project.team)
        ? project.team.slice(0, 10).map((uid: string) => usersMap.get(uid)).filter(Boolean).map((u) => ({ user: { id: u!.id, name: u!.name, avatar: u!.avatar, level: u!.level } }))
        : [];
      return {
        ...s,
        project: project
          ? {
              id: project.id,
              title: project.name,
              name: project.name,
              xpReward: (project as { xp_reward?: number }).xp_reward ?? 0,
              department: { name: project.type, color: '#888' },
              creator: creator ? { id: creator.id, name: creator.name, avatar: creator.avatar } : null,
              members,
            }
          : { id: s.project_id, title: s.project_id, name: s.project_id, xpReward: 0, department: { name: '', color: '#888' }, creator: null, members: [] },
      };
    });
    res.json({ showcases });
  } catch (e) {
    console.error('[showcase] list error:', e);
    res.status(500).json({ error: 'Failed to fetch showcases' });
  }
});

// POST /api/showcase/:projectId - Add project to showcase (admin)
router.post('/:projectId', requireJwt, requireAdmin, async (req, res) => {
  const projectId = req.params.projectId;
  const body = req.body ?? {};
  const impactSummary = typeof body.impactSummary === 'string' ? body.impactSummary.trim() : '';
  if (!impactSummary) {
    res.status(400).json({ error: 'impactSummary is required' });
    return;
  }
  const project = await getProjectById(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const existing = await getShowcaseByProjectId(projectId);
  if (existing) {
    res.status(400).json({ error: 'Project already in showcase' });
    return;
  }
  const impactMetrics = Array.isArray(body.impactMetrics) ? body.impactMetrics : [];
  const testimonial = typeof body.testimonial === 'string' ? body.testimonial : undefined;
  const coverImage = typeof body.coverImage === 'string' ? body.coverImage : undefined;
  const screenshots = Array.isArray(body.screenshots) ? (body.screenshots as string[]) : [];
  try {
    const showcase = await createShowcase({
      projectId,
      impactSummary,
      impactMetrics,
      testimonial,
      coverImage,
      screenshots,
    });
    res.status(201).json({ showcase });
  } catch (e) {
    console.error('[showcase] create error:', e);
    res.status(500).json({ error: 'Failed to create showcase' });
  }
});

// POST /api/showcase/:id/like - Toggle like
router.post('/:id/like', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  try {
    const result = await toggleShowcaseLike(req.params.id, userId);
    res.json({ liked: result.liked, likes: result.likes });
  } catch (e) {
    const err = e as Error;
    if (err.message === 'Showcase not found') return res.status(404).json({ error: 'Showcase not found' });
    console.error('[showcase] like error:', e);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// POST /api/showcase/:id/feature - Toggle featured (admin)
router.post('/:id/feature', requireJwt, requireAdmin, async (req, res) => {
  try {
    const featured = await toggleShowcaseFeatured(req.params.id);
    res.json({ featured });
  } catch (e) {
    const err = e as Error;
    if (err.message === 'Showcase not found') return res.status(404).json({ error: 'Showcase not found' });
    console.error('[showcase] feature error:', e);
    res.status(500).json({ error: 'Failed to toggle feature' });
  }
});

export const showcaseRouter = router;

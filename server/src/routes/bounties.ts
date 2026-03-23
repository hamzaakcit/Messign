import { Router } from 'express';
import {
  getBounties,
  getBountyById,
  getBountiesByCreator,
  getBountiesByClaimedBy,
  createBounty,
  claimBounty,
  submitBounty,
  reviewBounty,
  unclaimBounty,
  type BountyCategory,
  type BountyUrgency,
} from '../db/bountiesDb.js';
import { getEmployeeByIdAsUser, getEmployeesByIdsAsUsers } from '../db/employeesDb.js';
import { requireJwt } from '../middleware/authMiddleware.js';

const router = Router();
const categories: BountyCategory[] = ['DESIGN', 'CONTENT', 'DEVELOPMENT', 'DATA', 'RESEARCH', 'ADMIN', 'OTHER'];
const urgencies: BountyUrgency[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

function validateCategory(c: string): c is BountyCategory {
  return categories.includes(c as BountyCategory);
}
function validateUrgency(u: string): u is BountyUrgency {
  return urgencies.includes(u as BountyUrgency);
}

// GET /api/bounties - List bounties (default status=OPEN)
router.get('/', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  try {
    const status = (req.query.status as string) ?? 'OPEN';
    const category = req.query.category as string | undefined;
    const urgency = req.query.urgency as string | undefined;
    const bounties = await getBounties({
      status,
      category: category && validateCategory(category) ? category : undefined,
      urgency: urgency && validateUrgency(urgency) ? urgency : undefined,
    });
    const userIds = [...new Set(bounties.flatMap(b => [b.creator_id, b.claimed_by].filter(Boolean) as string[]))];
    const usersMap = await getEmployeesByIdsAsUsers(userIds);
    const withCreator = bounties.map((b) => {
      const creator = usersMap.get(b.creator_id) ?? null;
      const claimedByUser = b.claimed_by ? usersMap.get(b.claimed_by) ?? null : null;
      return {
        ...b,
        creator: creator ? { id: creator.id, name: creator.name, avatar: creator.avatar, department: creator.department } : { id: b.creator_id, name: '', avatar: '', department: '' },
        claimedByUser: claimedByUser ? { id: claimedByUser.id, name: claimedByUser.name, avatar: claimedByUser.avatar } : null,
        department: b.department ? { id: b.department, name: b.department } : null,
      };
    });
    res.json({ bounties: withCreator });
  } catch (e) {
    console.error('[bounties] list error:', e);
    res.status(500).json({ error: 'Failed to fetch bounties' });
  }
});

// GET /api/bounties/my - User's created and claimed bounties
router.get('/my', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  try {
    const [createdRows, claimedRows] = await Promise.all([
      getBountiesByCreator(userId),
      getBountiesByClaimedBy(userId),
    ]);
    const withUsers = async (rows: Awaited<ReturnType<typeof getBountiesByCreator>>) =>
      Promise.all(
        rows.map(async (b) => {
          const creator = await getEmployeeByIdAsUser(b.creator_id);
          const claimedByUser = b.claimed_by ? await getEmployeeByIdAsUser(b.claimed_by) : null;
          return {
            ...b,
            creator: creator ? { id: creator.id, name: creator.name, avatar: creator.avatar } : { id: b.creator_id, name: '', avatar: '' },
            claimedByUser: claimedByUser ? { id: claimedByUser.id, name: claimedByUser.name, avatar: claimedByUser.avatar } : null,
            department: b.department ? { id: b.department, name: b.department } : null,
          };
        })
      );
    const [created, claimed] = await Promise.all([withUsers(createdRows), withUsers(claimedRows)]);
    res.json({ created, claimed });
  } catch (e) {
    console.error('[bounties] my error:', e);
    res.status(500).json({ error: 'Failed to fetch bounties' });
  }
});

// POST /api/bounties - Create bounty
router.post('/', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  const body = req.body ?? {};
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = typeof body.description === 'string' ? body.description : '';
  const category = body.category as string;
  if (!title || title.length < 5 || title.length > 100) {
    res.status(400).json({ error: 'title must be 5-100 characters' });
    return;
  }
  if (!description || description.length < 10 || description.length > 2000) {
    res.status(400).json({ error: 'description must be 10-2000 characters' });
    return;
  }
  if (!validateCategory(category)) {
    res.status(400).json({ error: 'Invalid category' });
    return;
  }
  const xpReward = Math.min(200, Math.max(10, Number(body.xpReward) || 50));
  const estimatedMinutes = Math.min(480, Math.max(15, Number(body.estimatedMinutes) || 60));
  const urgency = validateUrgency(body.urgency) ? body.urgency : 'NORMAL';
  const department = typeof body.departmentId === 'string' ? body.departmentId : typeof body.department === 'string' ? body.department : null;
  const expiresAt = typeof body.expiresAt === 'string' ? body.expiresAt : null;
  const attachments: { name: string; url: string }[] = Array.isArray(body.attachments)
    ? (body.attachments as { name?: string; url?: string }[])
        .filter((a): a is { name: string; url: string } => a != null && typeof a.name === 'string' && typeof a.url === 'string')
    : [];
  try {
    const bounty = await createBounty(userId, {
      title,
      description,
      category: category as BountyCategory,
      department,
      xpReward,
      estimatedMinutes,
      urgency,
      expiresAt,
      attachments,
    });
    const creator = await getEmployeeByIdAsUser(userId);
    res.status(201).json({
      bounty: {
        ...bounty,
        creator: creator ? { id: creator.id, name: creator.name, avatar: creator.avatar } : { id: userId, name: '', avatar: '' },
        department: bounty.department ? { id: bounty.department, name: bounty.department } : null,
      },
    });
  } catch (e) {
    console.error('[bounties] create error:', e);
    res.status(500).json({ error: 'Failed to create bounty' });
  }
});

// POST /api/bounties/:id/claim
router.post('/:id/claim', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  try {
    const bounty = await claimBounty(req.params.id, userId);
    if (!bounty) {
      const existing = await getBountyById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Bounty not found' });
      if (existing.status !== 'OPEN') return res.status(400).json({ error: 'Bounty is not available' });
      if (existing.creator_id === userId) return res.status(400).json({ error: 'Cannot claim your own bounty' });
      return res.status(400).json({ error: 'Could not claim bounty' });
    }
    const creator = await getEmployeeByIdAsUser(bounty.creator_id);
    const claimedByUser = await getEmployeeByIdAsUser(userId);
    res.json({
      bounty: {
        ...bounty,
        creator: creator ? { id: creator.id, name: creator.name, avatar: creator.avatar } : null,
        claimedByUser: claimedByUser ? { id: claimedByUser.id, name: claimedByUser.name, avatar: claimedByUser.avatar } : null,
      },
    });
  } catch (e) {
    console.error('[bounties] claim error:', e);
    res.status(500).json({ error: 'Failed to claim bounty' });
  }
});

// POST /api/bounties/:id/submit
router.post('/:id/submit', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  try {
    const bounty = await submitBounty(req.params.id, userId);
    if (!bounty) {
      const existing = await getBountyById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Bounty not found' });
      if (existing.claimed_by !== userId) return res.status(403).json({ error: 'Not your bounty' });
      return res.status(400).json({ error: 'Invalid bounty status' });
    }
    res.json({ bounty });
  } catch (e) {
    console.error('[bounties] submit error:', e);
    res.status(500).json({ error: 'Failed to submit bounty' });
  }
});

// POST /api/bounties/:id/review
router.post('/:id/review', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  const approved = req.body?.approved === true;
  const note = typeof req.body?.note === 'string' ? req.body.note : undefined;
  const rating = typeof req.body?.rating === 'number' && req.body.rating >= 1 && req.body.rating <= 5 ? req.body.rating : undefined;
  try {
    const result = await reviewBounty(req.params.id, userId, approved, note, rating);
    if (!result.ok) {
      const existing = await getBountyById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Bounty not found' });
      if (existing.creator_id !== userId) return res.status(403).json({ error: 'Only creator can review' });
      return res.status(400).json({ error: result.message });
    }
    res.json({ message: result.message });
  } catch (e) {
    console.error('[bounties] review error:', e);
    res.status(500).json({ error: 'Failed to review bounty' });
  }
});

// POST /api/bounties/:id/unclaim
router.post('/:id/unclaim', requireJwt, async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }
  try {
    const ok = await unclaimBounty(req.params.id, userId);
    if (!ok) {
      const existing = await getBountyById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Bounty not found' });
      return res.status(403).json({ error: 'Not your bounty' });
    }
    res.json({ message: 'Bounty unclaimed' });
  } catch (e) {
    console.error('[bounties] unclaim error:', e);
    res.status(500).json({ error: 'Failed to unclaim bounty' });
  }
});

export const bountiesRouter = router;

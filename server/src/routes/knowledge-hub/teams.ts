import { Router, Request, Response } from 'express';
import * as db from '../../db/knowledgeV2Db.js';
import { requireKnowledgeRole } from '../../middleware/knowledgePermissions.js';

export const teamsRouter = Router();

teamsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const teams = await db.listTeams();
    res.json(teams);
  } catch (e) {
    console.error('[kh-teams] list:', e);
    res.status(500).json({ error: 'Failed to list teams' });
  }
});

teamsRouter.post('/', requireKnowledgeRole('admin', 'cpo'), async (req: Request, res: Response) => {
  try {
    const team = await db.createTeam(req.body);
    res.status(201).json(team);
  } catch (e) {
    console.error('[kh-teams] create:', e);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

teamsRouter.post('/:id/members', requireKnowledgeRole('admin', 'cpo'), async (req: Request, res: Response) => {
  try {
    await db.addTeamMember(req.params.id, req.body.userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[kh-teams] add member:', e);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

teamsRouter.delete('/:id/members/:userId', requireKnowledgeRole('admin', 'cpo'), async (req: Request, res: Response) => {
  try {
    await db.removeTeamMember(req.params.id, req.params.userId);
    res.status(204).end();
  } catch (e) {
    console.error('[kh-teams] remove member:', e);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

teamsRouter.delete('/:id', requireKnowledgeRole('admin', 'cpo'), async (req: Request, res: Response) => {
  try {
    await db.deleteTeam(req.params.id);
    res.status(204).end();
  } catch (e) {
    console.error('[kh-teams] delete:', e);
    res.status(500).json({ error: 'Failed to delete team' });
  }
});

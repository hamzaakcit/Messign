import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import type { CallerContext } from '../../../dal/types.js';
import * as contactsDal from '../dal/contacts.js';

const router = Router();

function buildCtx(req: ReimbursementRequest): CallerContext {
  const user = req.reimbursementUser!;
  return {
    userId: user.id,
    role: user.role as CallerContext['role'],
    organizationId: req.organizationId,
  };
}

router.get('/search', async (req: ReimbursementRequest, res: Response) => {
  try {
    const q = req.query.q as string;
    if (!q) { res.status(400).json({ error: 'Search query (q) is required' }); return; }
    const contacts = await contactsDal.searchContacts(buildCtx(req), q);
    res.json(contacts);
  } catch (err) {
    console.error('[crm/contacts/search GET]', err);
    res.status(500).json({ error: 'Failed to search contacts' });
  }
});

router.get('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const filters: contactsDal.ContactFilters = {
      company_id: req.query.company_id as string | undefined,
      owner_id: req.query.owner_id as string | undefined,
      source: req.query.source as string | undefined,
      search: req.query.search as string | undefined,
    };
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string) : 20;
    const sort = req.query.sort_by
      ? { field: req.query.sort_by as string, direction: (req.query.sort_dir as 'asc' | 'desc') || 'asc' }
      : undefined;

    const result = await contactsDal.listContacts(buildCtx(req), filters, sort, page, pageSize);
    res.json(result);
  } catch (err) {
    console.error('[crm/contacts GET]', err);
    res.status(500).json({ error: 'Failed to list contacts' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const contact = await contactsDal.getContactById(buildCtx(req), req.params.id);
    if (!contact) { res.status(404).json({ error: 'Contact not found' }); return; }
    res.json(contact);
  } catch (err) {
    console.error('[crm/contacts/:id GET]', err);
    res.status(500).json({ error: 'Failed to get contact' });
  }
});

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { first_name } = req.body;
    if (!first_name) { res.status(400).json({ error: 'First name is required' }); return; }
    const contact = await contactsDal.createContact(buildCtx(req), req.body);
    res.status(201).json(contact);
  } catch (err) {
    console.error('[crm/contacts POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create contact' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const contact = await contactsDal.updateContact(buildCtx(req), req.params.id, req.body);
    res.json(contact);
  } catch (err) {
    console.error('[crm/contacts/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update contact' });
  }
});

router.delete('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    await contactsDal.deleteContact(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[crm/contacts/:id DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete contact' });
  }
});

export default router;

import { Router } from 'express';
import type { Response } from 'express';
import type { ReimbursementRequest } from '../../../middleware/reimbursementAuth.js';
import type { CallerContext } from '../../../dal/types.js';
import * as companiesDal from '../dal/companies.js';

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
    const filters: companiesDal.CompanyFilters = {
      industry: req.query.industry as string | undefined,
      size: req.query.size as string | undefined,
      search: req.query.search as string | undefined,
    };
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string) : 20;
    const sort = req.query.sort_by
      ? { field: req.query.sort_by as string, direction: (req.query.sort_dir as 'asc' | 'desc') || 'asc' }
      : undefined;

    const result = await companiesDal.listCompanies(buildCtx(req), filters, sort, page, pageSize);
    res.json(result);
  } catch (err) {
    console.error('[crm/companies GET]', err);
    res.status(500).json({ error: 'Failed to list companies' });
  }
});

router.get('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const company = await companiesDal.getCompanyById(buildCtx(req), req.params.id);
    if (!company) { res.status(404).json({ error: 'Company not found' }); return; }
    res.json(company);
  } catch (err) {
    console.error('[crm/companies/:id GET]', err);
    res.status(500).json({ error: 'Failed to get company' });
  }
});

router.post('/', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { name } = req.body;
    if (!name) { res.status(400).json({ error: 'Company name is required' }); return; }
    const company = await companiesDal.createCompany(buildCtx(req), req.body);
    res.status(201).json(company);
  } catch (err) {
    console.error('[crm/companies POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create company' });
  }
});

router.put('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const company = await companiesDal.updateCompany(buildCtx(req), req.params.id, req.body);
    res.json(company);
  } catch (err) {
    console.error('[crm/companies/:id PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update company' });
  }
});

router.delete('/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    await companiesDal.deleteCompany(buildCtx(req), req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('[crm/companies/:id DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete company' });
  }
});

export default router;

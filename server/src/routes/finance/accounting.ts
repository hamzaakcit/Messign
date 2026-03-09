import { Router } from 'express';
import type { Response } from 'express';
import { type ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import { requireFinanceRole } from '../../middleware/financeRbac.js';
import { glAccountService } from '../../services/finance/glAccountService.js';
import { journalEntryService } from '../../services/finance/journalEntryService.js';
import { accountingReportService } from '../../services/finance/accountingReportService.js';
import { taxService } from '../../services/finance/taxService.js';
import { periodCloseService } from '../../services/finance/periodCloseService.js';

const router = Router();

router.get('/gl-accounts/tree', async (req: ReimbursementRequest, res: Response) => {
  try {
    const tree = await glAccountService.getTree(req.organizationId!);
    res.json(tree);
  } catch (err) {
    console.error('[finance/gl-accounts/tree]', err);
    res.status(500).json({ error: 'Failed to load account tree' });
  }
});

router.get('/gl-accounts/trial-balance', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { period } = req.query;
    const tb = await glAccountService.getTrialBalance(req.organizationId!, period as string | undefined);
    res.json(tb);
  } catch (err) {
    console.error('[finance/gl-accounts/trial-balance]', err);
    res.status(500).json({ error: 'Failed to load trial balance' });
  }
});

router.get('/gl-accounts', async (req: ReimbursementRequest, res: Response) => {
  try {
    const accounts = await glAccountService.list(req.organizationId!);
    res.json(accounts);
  } catch (err) {
    console.error('[finance/gl-accounts]', err);
    res.status(500).json({ error: 'Failed to load GL accounts' });
  }
});

router.get('/gl-accounts/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const account = await glAccountService.getById(req.organizationId!, req.params.id);
    if (!account) { res.status(404).json({ error: 'Account not found' }); return; }
    res.json(account);
  } catch (err) {
    console.error('[finance/gl-accounts/:id]', err);
    res.status(500).json({ error: 'Failed to load GL account' });
  }
});

router.post('/gl-accounts', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const account = await glAccountService.create(req.organizationId!, req.body);
    res.status(201).json(account);
  } catch (err) {
    console.error('[finance/gl-accounts POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create account' });
  }
});

router.put('/gl-accounts/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const account = await glAccountService.update(req.organizationId!, req.params.id, req.body);
    res.json(account);
  } catch (err) {
    console.error('[finance/gl-accounts PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update account' });
  }
});

router.delete('/gl-accounts/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const account = await glAccountService.deactivate(req.organizationId!, req.params.id);
    res.json(account);
  } catch (err) {
    console.error('[finance/gl-accounts DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to deactivate account' });
  }
});

router.get('/journal-entries', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { period, source_type, status, search, limit, offset } = req.query;
    const result = await journalEntryService.list(req.organizationId!, {
      period: period as string,
      source_type: source_type as string,
      status: status as string,
      search: search as string,
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    });
    res.json(result);
  } catch (err) {
    console.error('[finance/journal-entries]', err);
    res.status(500).json({ error: 'Failed to load journal entries' });
  }
});

router.get('/journal-entries/:id', async (req: ReimbursementRequest, res: Response) => {
  try {
    const entry = await journalEntryService.getById(req.organizationId!, req.params.id);
    if (!entry) { res.status(404).json({ error: 'Journal entry not found' }); return; }
    res.json(entry);
  } catch (err) {
    console.error('[finance/journal-entries/:id]', err);
    res.status(500).json({ error: 'Failed to load journal entry' });
  }
});

router.post('/journal-entries', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const orgId = req.organizationId!;
    const userId = req.reimbursementUser!.id;
    const { description, entry_date, period, reference, lines } = req.body;

    if (!description || !lines || !Array.isArray(lines) || lines.length < 2) {
      res.status(400).json({ error: 'Description and at least 2 lines are required' });
      return;
    }
    const totalDebit = lines.reduce((s: number, l: { debit: number }) => s + (Number(l.debit) || 0), 0);
    const totalCredit = lines.reduce((s: number, l: { credit: number }) => s + (Number(l.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      res.status(400).json({ error: `Debits ($${totalDebit.toFixed(2)}) must equal credits ($${totalCredit.toFixed(2)})` });
      return;
    }

    const entryDate = entry_date || new Date().toISOString().split('T')[0];
    const entryPeriod = period || entryDate.slice(0, 7);

    const entry = await journalEntryService._createEntry(orgId, {
      description,
      source_type: 'manual',
      source_id: reference || `manual-${Date.now()}`,
      period: entryPeriod,
      entry_date: entryDate,
      lines: lines.map((l: { gl_code: string; debit: number; credit: number; description?: string }) => ({
        gl_code: l.gl_code,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description || description,
      })),
      created_by: userId,
    });

    res.status(201).json(entry);
  } catch (err) {
    console.error('[finance/journal-entries POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create journal entry' });
  }
});

router.post('/journal-entries/:id/void', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const reversal = await journalEntryService.void_(req.organizationId!, req.params.id, user.id);
    res.json(reversal);
  } catch (err) {
    console.error('[finance/journal-entries/void]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to void entry' });
  }
});

router.get('/reports/profit-loss', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { period_from, period_to } = req.query;
    const now = new Date();
    const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const report = await accountingReportService.getProfitLoss(
      req.organizationId!,
      (period_from as string) || defaultPeriod,
      (period_to as string) || defaultPeriod,
    );
    res.json(report);
  } catch (err) {
    console.error('[finance/reports/profit-loss]', err);
    res.status(500).json({ error: 'Failed to generate P&L report' });
  }
});

router.get('/reports/ap-aging', async (req: ReimbursementRequest, res: Response) => {
  try {
    const report = await accountingReportService.getAPAging(req.organizationId!);
    res.json(report);
  } catch (err) {
    console.error('[finance/reports/ap-aging]', err);
    res.status(500).json({ error: 'Failed to generate AP aging report' });
  }
});

router.get('/reports/ar-aging', async (req: ReimbursementRequest, res: Response) => {
  try {
    const report = await accountingReportService.getARAging(req.organizationId!);
    res.json(report);
  } catch (err) {
    console.error('[finance/reports/ar-aging]', err);
    res.status(500).json({ error: 'Failed to generate AR aging report' });
  }
});

router.get('/reports/balance-sheet', async (req: ReimbursementRequest, res: Response) => {
  try {
    const asOfDate = req.query.as_of_date as string | undefined;
    const report = await accountingReportService.getBalanceSheet(req.organizationId!, asOfDate);
    res.json(report);
  } catch (err) {
    console.error('[finance/reports/balance-sheet]', err);
    res.status(500).json({ error: 'Failed to generate balance sheet' });
  }
});

router.get('/reports/tax-summary', async (req: ReimbursementRequest, res: Response) => {
  try {
    const { period_from, period_to } = req.query;
    const now = new Date();
    const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const report = await accountingReportService.getTaxSummary(
      req.organizationId!,
      (period_from as string) || defaultPeriod,
      (period_to as string) || defaultPeriod,
    );
    res.json(report);
  } catch (err) {
    console.error('[finance/reports/tax-summary]', err);
    res.status(500).json({ error: 'Failed to generate tax summary' });
  }
});

router.get('/tax-rates', async (req: ReimbursementRequest, res: Response) => {
  try {
    const rates = await taxService.list(req.organizationId!);
    res.json(rates);
  } catch (err) {
    console.error('[finance/tax-rates]', err);
    res.status(500).json({ error: 'Failed to load tax rates' });
  }
});

router.post('/tax-rates', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const rate = await taxService.create(req.organizationId!, req.body);
    res.status(201).json(rate);
  } catch (err) {
    console.error('[finance/tax-rates POST]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create tax rate' });
  }
});

router.put('/tax-rates/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const rate = await taxService.update(req.organizationId!, req.params.id, req.body);
    res.json(rate);
  } catch (err) {
    console.error('[finance/tax-rates PUT]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update tax rate' });
  }
});

router.delete('/tax-rates/:id', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const rate = await taxService.deactivate(req.organizationId!, req.params.id);
    res.json(rate);
  } catch (err) {
    console.error('[finance/tax-rates DELETE]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to deactivate tax rate' });
  }
});

router.get('/period-close', async (req: ReimbursementRequest, res: Response) => {
  try {
    const periods = await periodCloseService.list(req.organizationId!);
    res.json(periods);
  } catch (err) {
    console.error('[finance/period-close]', err);
    res.status(500).json({ error: 'Failed to load period closes' });
  }
});

router.get('/period-close/:period', async (req: ReimbursementRequest, res: Response) => {
  try {
    const pc = await periodCloseService.getOrCreate(req.organizationId!, req.params.period);
    res.json(pc);
  } catch (err) {
    console.error('[finance/period-close/:period]', err);
    res.status(500).json({ error: 'Failed to load period close' });
  }
});

router.put('/period-close/:id/task', async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const { task_key, completed } = req.body;
    const task = await periodCloseService.updateTask(req.organizationId!, req.params.id, task_key, completed, user.id);
    res.json(task);
  } catch (err) {
    console.error('[finance/period-close/task]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update task' });
  }
});

router.post('/period-close/:id/close', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const pc = await periodCloseService.closePeriod(req.organizationId!, req.params.id, user.id);
    res.json(pc);
  } catch (err) {
    console.error('[finance/period-close/close]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to close period' });
  }
});

router.post('/period-close/:id/lock', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const pc = await periodCloseService.lockPeriod(req.organizationId!, req.params.id, user.id);
    res.json(pc);
  } catch (err) {
    console.error('[finance/period-close/lock]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to lock period' });
  }
});

router.post('/period-close/:id/reopen', requireFinanceRole('finance', 'admin'), async (req: ReimbursementRequest, res: Response) => {
  try {
    const user = req.reimbursementUser!;
    const pc = await periodCloseService.reopenPeriod(req.organizationId!, req.params.id, user.id);
    res.json(pc);
  } catch (err) {
    console.error('[finance/period-close/reopen]', err);
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to reopen period' });
  }
});

export default router;

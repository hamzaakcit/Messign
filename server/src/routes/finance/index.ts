import { Router } from 'express';
import { reimbursementAuth } from '../../middleware/reimbursementAuth.js';
import commonRouter from './common.js';
import expensesRouter, { categoriesRouter } from './expenses.js';
import invoicesRouter from './invoices.js';
import budgetsRouter from './budgets.js';
import vendorsRouter from './vendors.js';
import paymentsRouter from './payments.js';
import accountingRouter from './accounting.js';
import settingsRouter from './settings.js';
import doraRouter from './dora.js';

const router = Router();

router.use(reimbursementAuth);

router.use(commonRouter);
router.use('/expenses', expensesRouter);
router.use('/categories', categoriesRouter);
router.use(invoicesRouter);
router.use('/budgets', budgetsRouter);
router.use('/vendors', vendorsRouter);
router.use('/payments', paymentsRouter);
router.use(accountingRouter);
router.use(settingsRouter);
router.use(doraRouter);

export { router as financeRouter };

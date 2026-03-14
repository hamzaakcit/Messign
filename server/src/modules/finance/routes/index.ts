import { Router } from 'express';
import { reimbursementAuth } from '../../../middleware/reimbursementAuth.js';
import commonRouter from './common.js';
import expensesRouter, { categoriesRouter } from './expenses.js';
import invoicesRouter from './invoices.js';
import budgetsRouter from './budgets.js';
import vendorsRouter from './vendors.js';
import paymentsRouter from './payments.js';
import accountingRouter from './accounting.js';
import settingsRouter from './settings.js';
import doraRouter from './dora.js';
import { reimbursementsRouter } from './reimbursements.js';
import { approvalsRouter } from './approvals.js';
import { legacyInvoicesRouter } from './legacyInvoices.js';
import { legacyBudgetsRouter } from './legacyBudgets.js';
import { bankDetailsRouter } from './bankDetails.js';

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

// Reimbursements, approvals, bank details, and legacy invoice/budget APIs
router.use('/reimbursements', reimbursementsRouter);
router.use('/approvals', approvalsRouter);
router.use('/bank-details', bankDetailsRouter);
router.use('/invoices-legacy', legacyInvoicesRouter);
router.use('/budgets-legacy', legacyBudgetsRouter);

export { router as financeRouter };

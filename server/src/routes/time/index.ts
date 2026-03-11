import { Router } from 'express';
import { reimbursementAuth } from '../../middleware/reimbursementAuth.js';
import entriesRouter from './entries.js';
import timersRouter from './timers.js';
import timesheetsRouter from './timesheets.js';
import utilizationRouter from './utilization.js';
import categoriesRouter from './categories.js';

const router = Router();

router.use(reimbursementAuth);
router.use('/entries', entriesRouter);
router.use('/timers', timersRouter);
router.use('/timesheets', timesheetsRouter);
router.use('/utilization', utilizationRouter);
router.use('/categories', categoriesRouter);

export default router;

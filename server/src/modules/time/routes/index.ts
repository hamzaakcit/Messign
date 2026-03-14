import { Router } from 'express';
import { reimbursementAuth } from '../../../middleware/reimbursementAuth.js';
import entriesRouter from '../../../routes/time/entries.js';
import timersRouter from '../../../routes/time/timers.js';
import timesheetsRouter from '../../../routes/time/timesheets.js';
import utilizationRouter from '../../../routes/time/utilization.js';
import categoriesRouter from '../../../routes/time/categories.js';

const router = Router();

router.use(reimbursementAuth);
router.use('/entries', entriesRouter);
router.use('/timers', timersRouter);
router.use('/timesheets', timesheetsRouter);
router.use('/utilization', utilizationRouter);
router.use('/categories', categoriesRouter);

export default router;

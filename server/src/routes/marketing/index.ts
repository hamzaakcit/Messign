import { Router } from 'express';
import { reimbursementAuth } from '../../middleware/reimbursementAuth.js';
import campaignsRouter from './campaigns.js';
import contentRouter from './content.js';
import leadsRouter from './leads.js';
import emailsRouter from './emails.js';
import dashboardRouter from './dashboard.js';
import approvalsRouter from './approvals.js';
import calendarRouter from './calendar.js';

const router = Router();

router.use(reimbursementAuth);

router.use('/campaigns', campaignsRouter);
router.use('/content', contentRouter);
router.use('/leads', leadsRouter);
router.use('/emails', emailsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/approvals', approvalsRouter);
router.use('/calendar', calendarRouter);

export { router as marketingRouter };

import { Router } from 'express';
import { reimbursementAuth } from '../../middleware/reimbursementAuth.js';
import campaignsRouter from './campaigns.js';
import contentRouter from './content.js';
import leadsRouter from './leads.js';
import emailsRouter from './emails.js';
import dashboardRouter from './dashboard.js';

const router = Router();

router.use(reimbursementAuth);

router.use('/campaigns', campaignsRouter);
router.use('/content', contentRouter);
router.use('/leads', leadsRouter);
router.use('/emails', emailsRouter);
router.use('/dashboard', dashboardRouter);

export { router as marketingRouter };

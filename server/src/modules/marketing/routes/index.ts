import { Router } from 'express';
import { reimbursementAuth } from '../../../middleware/reimbursementAuth.js';
import campaignsRouter from '../../../routes/marketing/campaigns.js';
import contentRouter from '../../../routes/marketing/content.js';
import leadsRouter from '../../../routes/marketing/leads.js';
import emailsRouter from '../../../routes/marketing/emails.js';
import dashboardRouter from '../../../routes/marketing/dashboard.js';

const router = Router();

router.use(reimbursementAuth);
router.use('/campaigns', campaignsRouter);
router.use('/content', contentRouter);
router.use('/leads', leadsRouter);
router.use('/emails', emailsRouter);
router.use('/dashboard', dashboardRouter);

export default router;

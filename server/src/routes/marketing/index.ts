/**
 * @deprecated This aggregate router is NOT mounted by the module system.
 * The active marketing router is in modules/marketing/routes/index.ts.
 * This file is kept temporarily for reference; safe to delete.
 */
import { Router } from 'express';
import { reimbursementAuth } from '../../middleware/reimbursementAuth.js';
import campaignsRouter from './campaigns.js';
import contentRouter from './content.js';
import leadsRouter from './leads.js';
import emailsRouter from './emails.js';
import dashboardRouter from './dashboard.js';
import approvalsRouter from './approvals.js';
import calendarRouter from './calendar.js';
import pagesRouter from './pages.js';
import popupsRouter from './popups.js';
import documentsRouter from './documents.js';
import brandProfileRouter from './brandProfile.js';
import templatesRouter from './templates.js';
import overlayAssetsRouter from './overlayAssets.js';
import batchRouter from './batch.js';
import performanceRouter from './performanceRoutes.js';
import brandProfilesRouter from './brandProfileRoutes.js';
import complianceRouter from './complianceRoutes.js';

const router = Router();

router.use(reimbursementAuth);

router.use('/campaigns', campaignsRouter);
router.use('/content', contentRouter);
router.use('/leads', leadsRouter);
router.use('/emails', emailsRouter);
router.use('/pages', pagesRouter);
router.use('/popups', popupsRouter);
router.use('/documents', documentsRouter);
router.use('/brand-profile', brandProfileRouter);
router.use('/dashboard', dashboardRouter);
router.use('/approvals', approvalsRouter);
router.use('/calendar', calendarRouter);
router.use('/templates', templatesRouter);
router.use('/overlay-assets', overlayAssetsRouter);
router.use('/batch', batchRouter);
router.use('/performance', performanceRouter);
router.use('/brand-profiles', brandProfilesRouter);
router.use('/compliance', complianceRouter);

export { router as marketingRouter };

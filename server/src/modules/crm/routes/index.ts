/**
 * CRM Module — API routes
 */
import { Router } from 'express';
import { reimbursementAuth } from '../../../middleware/reimbursementAuth.js';
import pipelinesRouter from './pipelines.js';
import companiesRouter from './companies.js';
import contactsRouter from './contacts.js';
import dealsRouter from './deals.js';
import activitiesRouter from './activities.js';
import forecastRouter from './forecast.js';

const router = Router();

router.use(reimbursementAuth);

router.use('/pipelines', pipelinesRouter);
router.use('/companies', companiesRouter);
router.use('/contacts', contactsRouter);
router.use('/deals', dealsRouter);
router.use('/activities', activitiesRouter);
router.use('/forecast', forecastRouter);

export { router as crmRouter };

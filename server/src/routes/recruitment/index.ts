import { Router } from 'express';
import { reimbursementAuth } from '../../middleware/reimbursementAuth.js';
import jobsRouter from './jobs.js';
import candidatesRouter from './candidates.js';
import applicationsRouter from './applications.js';
import interviewsRouter from './interviews.js';
import offersRouter from './offers.js';
import dashboardRouter from './dashboard.js';

const router = Router();

router.use(reimbursementAuth);

router.use('/jobs', jobsRouter);
router.use('/candidates', candidatesRouter);
router.use('/applications', applicationsRouter);
router.use('/interviews', interviewsRouter);
router.use('/offers', offersRouter);
router.use('/dashboard', dashboardRouter);

export { router as recruitmentRouter };

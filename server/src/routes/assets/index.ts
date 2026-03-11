import { Router } from 'express';
import { reimbursementAuth } from '../../middleware/reimbursementAuth.js';
import assetsRouter from './assets.js';
import licensesRouter from './licenses.js';
import categoriesRouter from './categories.js';

const router = Router();

router.use(reimbursementAuth);
router.use('/assets', assetsRouter);
router.use('/licenses', licensesRouter);
router.use('/categories', categoriesRouter);

export { router as assetsRouter };

import { Router } from 'express';
import { reimbursementAuth } from '../../middleware/reimbursementAuth.js';
import contractsRouter from './contracts.js';
import signatoriesRouter from './signatories.js';
import obligationsRouter from './obligations.js';

const router = Router();

router.use(reimbursementAuth);
router.use('/contracts', contractsRouter);
router.use('/signatories', signatoriesRouter);
router.use('/obligations', obligationsRouter);

export { router as contractsRouter };

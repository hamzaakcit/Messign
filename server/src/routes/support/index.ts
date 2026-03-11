import { Router } from 'express';
import { reimbursementAuth } from '../../middleware/reimbursementAuth.js';
import ticketsRouter from './tickets.js';
import slaRouter from './sla.js';
import csatRouter from './csat.js';
import customersRouter from './customers.js';
import categoriesRouter from './categories.js';
import dashboardRouter from './dashboard.js';

const router = Router();

router.use(reimbursementAuth);

router.use('/tickets', ticketsRouter);
router.use('/sla', slaRouter);
router.use('/csat', csatRouter);
router.use('/customers', customersRouter);
router.use('/categories', categoriesRouter);
router.use('/dashboard', dashboardRouter);

export default router;

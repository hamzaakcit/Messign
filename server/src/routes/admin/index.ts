import { Router } from 'express';
import { adminEmployeesRouter } from './employees.js';
import { adminDepartmentsRouter } from './departments.js';
import { adminRolesRouter } from './roles.js';
import { adminAuditRouter } from './audit.js';
import { adminSettingsRouter } from './settings.js';
import { adminImportExportRouter } from './importExport.js';
import { adminMessagesRouter } from './messages.js';
import { adminBadgesRouter } from './badges.js';
import { adminPerformanceRouter } from './performance.js';
import { adminAuthRouter } from './auth.js';
import { adminProjectsRouter } from './projects.js';
import { adminAnalyticsRouter } from './analytics.js';
import { adminKnowledgeRouter } from './knowledge.js';

const adminRouter = Router();

adminRouter.use('/auth', adminAuthRouter);
adminRouter.use('/employees', adminEmployeesRouter);
adminRouter.use('/departments', adminDepartmentsRouter);
adminRouter.use('/roles', adminRolesRouter);
adminRouter.use('/audit-logs', adminAuditRouter);
adminRouter.use('/settings', adminSettingsRouter);
adminRouter.use('/messages', adminMessagesRouter);
adminRouter.use('/badges', adminBadgesRouter);
adminRouter.use('/performance', adminPerformanceRouter);
adminRouter.use('/projects', adminProjectsRouter);
adminRouter.use('/analytics', adminAnalyticsRouter);
adminRouter.use('/knowledge', adminKnowledgeRouter);
adminRouter.use('/', adminImportExportRouter); // POST /import, GET /export

export { adminRouter };

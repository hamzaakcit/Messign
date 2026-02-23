import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

// Load .env from server package root (works when running from workspace root or server/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEnv = join(__dirname, '..', '.env');
const rootServerEnv = join(process.cwd(), 'server', '.env');
const cwdEnv = join(process.cwd(), '.env');
if (existsSync(serverEnv)) {
  dotenv.config({ path: serverEnv });
}
if (!process.env.GRAPHHOPPER_API_KEY && existsSync(rootServerEnv)) {
  dotenv.config({ path: rootServerEnv });
}
if (!process.env.GRAPHHOPPER_API_KEY && existsSync(cwdEnv)) {
  dotenv.config({ path: cwdEnv });
}
if (!process.env.GRAPHHOPPER_API_KEY) {
  dotenv.config();
}
if (!process.env.GRAPHHOPPER_API_KEY) {
  console.warn('[server] GRAPHHOPPER_API_KEY not set; mileage calculator will use fallback 10 km.');
}
import { setupSocketHandlers } from './sockets/index.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { channelsRouter } from './routes/channels.js';
import { messagesRouter } from './routes/messages.js';
import { chatRouter } from './routes/chat.js';
import { projectsRouter } from './routes/projects.js';
import { tasksRouter } from './routes/tasks.js';
import { badgesRouter } from './routes/badges.js';
import { documentsRouter } from './routes/documents.js';
import { activitiesRouter } from './routes/activities.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { adminRouter } from './routes/admin/index.js';
import { reimbursementsRouter } from './routes/reimbursements.js';
import { categoriesRouter } from './routes/categories.js';
import { exchangeRatesRouter } from './routes/exchangeRates.js';
import { mileageRouter } from './routes/mileage.js';
import { approvalsRouter } from './routes/approvals.js';
import { reimbursementSettingsRouter } from './routes/reimbursement-settings.js';
import { invoicesRouter } from './routes/invoices.js';
import { bankDetailsRouter } from './routes/bankDetails.js';
import { signaturesRouter } from './routes/signatures.js';
import { performanceRouter } from './routes/performance.js';
import { dashboardRouter } from './routes/dashboard.js';
import { departmentsRouter } from './routes/departments.js';
import { bountiesRouter } from './routes/bounties.js';
import { sprintsRouter } from './routes/sprints.js';
import { showcaseRouter } from './routes/showcase.js';
import { knowledgeRouter } from './routes/knowledge/index.js';
import { knowledgeHubRouter } from './routes/knowledge-hub/index.js';
import { actionRoutes } from './services/ai/actions/actionRoutes.js';
import { gameRouter } from './routes/game.js';
import { doraHistoryRouter } from './routes/doraHistory.js';
import { requireAuth } from './middleware/requireAuth.js';
import { optionalJwt } from './middleware/authMiddleware.js';
import { initializeAuthRecords } from './services/initAuth.js';
import { initNewTables } from './db/initNewTables.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});
app.set('io', io);

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb', type: 'application/json' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/api', optionalJwt);

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/chat', chatRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/badges', badgesRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/admin', adminRouter);
app.use('/api/reimbursements', reimbursementsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/exchange-rates', exchangeRatesRouter);
app.use('/api/mileage', mileageRouter);
app.use('/api/approvals', approvalsRouter);
app.use('/api/settings/reimbursement', reimbursementSettingsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/bank-details', bankDetailsRouter);
app.use('/api/signatures', signaturesRouter);
app.use('/api/performance', requireAuth, performanceRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/bounties', bountiesRouter);
app.use('/api/sprints', sprintsRouter);
app.use('/api/showcase', showcaseRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/knowledge-hub', knowledgeHubRouter);
app.use('/api/ai/actions', requireAuth, actionRoutes);
app.use('/api/game', requireAuth, gameRouter);
app.use('/api/dora', requireAuth, doraHistoryRouter);

// Health check
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler: catch unhandled errors from async route handlers (Express 4 doesn't catch these)
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server] Unhandled error:', err);
  if (res.headersSent) return;
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: message || 'Something went wrong. Please try again.' },
  });
});

app.set('io', io);
setupSocketHandlers(io);

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, async () => {
  console.log(`🚀 Messign server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io ready for connections`);
  try {
    await initNewTables();
  } catch (e) {
    console.warn('[initNewTables]', e);
  }
  try {
    await initializeAuthRecords();
  } catch (e) {
    console.warn('[initAuth]', e);
  }
});

export { io };

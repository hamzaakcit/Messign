import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
import { registerAllSubscribers } from './events/subscribers/index.js';
import { startAllWorkers } from './queue/workers/index.js';
import { initDoraScheduler } from './services/finance/doraScheduler.js';
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
import { categoriesRouter } from './routes/categories.js';
import { exchangeRatesRouter } from './routes/exchangeRates.js';
import { mileageRouter } from './routes/mileage.js';
import { reimbursementSettingsRouter } from './routes/reimbursement-settings.js';
import { signaturesRouter } from './routes/signatures.js';
import { performanceRouter } from './routes/performance.js';
import { dashboardRouter } from './routes/dashboard.js';
import { departmentsRouter } from './routes/departments.js';
import { bountiesRouter } from './routes/bounties.js';
import { sprintsRouter } from './routes/sprints.js';
import { showcaseRouter } from './routes/showcase.js';
import { knowledgeRouter } from './routes/knowledge/index.js';
import { actionRoutes } from './services/ai/actions/actionRoutes.js';
import { gameRouter } from './routes/game.js';
import { doraHistoryRouter } from './routes/doraHistory.js';
import doraInsightsRouter from './routes/dora/insights.js';
import doraAutomationsRouter from './routes/dora/automations.js';
import doraFiltersRouter from './routes/dora/filters.js';
import doraBriefingRouter from './routes/dora/briefing.js';
import doraApprovalsRouter from './routes/dora/approvals.js';
import { seedRouter } from './routes/seed.js';
import reportsRouter from './routes/reports/index.js';
import { initializeModules } from './modules/registry.js';
import webhookRouter from './routes/webhooks/index.js';
import notificationsRouter from './routes/notifications/index.js';
import { startBudgetAlertJob } from './jobs/budgetAlertJob.js';
import { requireAuth } from './middleware/requireAuth.js';
import aiV2Router from './routes/knowledge-hub/ai-v2.js';
import { optionalJwt } from './middleware/authMiddleware.js';
import { responseTimer } from './middleware/responseTimer.js';
import { initializeAuthRecords } from './services/initAuth.js';
import { initNewTables } from './db/initNewTables.js';

const app = express();
const httpServer = createServer(app);

// CORS: production allows messign.com, CLIENT_URL (Vercel), and ADDITIONAL_CORS_ORIGINS (comma-separated)
const CORS_ORIGINS = process.env.NODE_ENV === 'production'
  ? [
      'https://www.messign.com',
      'https://messign.com',
      process.env.CLIENT_URL || '',
      ...(process.env.ADDITIONAL_CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? []),
    ].filter(Boolean)
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001', 'http://127.0.0.1:3002'];
const corsOptions = {
  origin: CORS_ORIGINS,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
  },
});
app.set('io', io);

// Phase 5: will be replaced by cloud storage (Supabase Storage or R2); ephemeral disk is wiped on redeploy.
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

// Security headers
app.use(helmet({
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: '5mb', type: 'application/json' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(responseTimer);

// Health check — mounted before auth so monitoring tools can hit it without authentication
app.get('/health', async (_req, res) => {
  const checks: Record<string, 'ok' | 'error'> = {};

  try {
    const { pool } = await import('./db/index.js');
    await pool.query('SELECT 1');
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  try {
    const { redisConnection } = await import('./queue/connection.js');
    await redisConnection.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
  }

  try {
    const litellmUrl = process.env.LITELLM_URL || 'http://localhost:4000/v1';
    const baseUrl = litellmUrl.replace(/\/v1.*$/, '');
    const resp = await fetch(`${baseUrl}/health`);
    checks.litellm = resp.ok ? 'ok' : 'error';
  } catch {
    checks.litellm = 'error';
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});

// Rate limiting (relaxed in development for E2E tests and local dev)
const isDev = process.env.NODE_ENV !== 'production' || process.env.E2E_TEST === '1';
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: isDev ? 1000 : 100,
  message: { error: 'Too many requests' },
});
app.use('/api', apiLimiter);
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 10,
  message: { error: 'Too many login attempts' },
});
app.use('/api/auth/login', authLimiter);
const aiLimiter = rateLimit({ windowMs: 60_000, max: 10, message: { error: 'AI rate limit reached' } });
app.use('/api/dora', aiLimiter);

app.use('/api', optionalJwt);

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', requireAuth, usersRouter);
app.use('/api/channels', requireAuth, channelsRouter);
app.use('/api/messages', requireAuth, messagesRouter);
app.use('/api/chat', requireAuth, chatRouter);
app.use('/api/projects', requireAuth, projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/badges', badgesRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/activities', activitiesRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/admin', adminRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/exchange-rates', exchangeRatesRouter);
app.use('/api/mileage', mileageRouter);
app.use('/api/settings/reimbursement', reimbursementSettingsRouter);
app.use('/api/signatures', signaturesRouter);
app.use('/api/performance', requireAuth, performanceRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/departments', departmentsRouter);
app.use('/api/bounties', bountiesRouter);
app.use('/api/sprints', sprintsRouter);
app.use('/api/showcase', showcaseRouter);
app.use('/api/knowledge', knowledgeRouter);
app.use('/api/ai/actions', requireAuth, actionRoutes);
app.use('/api/v2/ai', requireAuth, aiV2Router);
app.use('/api/game', requireAuth, gameRouter);
app.use('/api/dora', doraInsightsRouter);
app.use('/api/dora/automations', doraAutomationsRouter);
app.use('/api/dora', doraFiltersRouter);
app.use('/api/dora', doraBriefingRouter);
app.use('/api/dora', doraApprovalsRouter);
app.use('/api/dora', requireAuth, doraHistoryRouter);
// Assets, Contracts: mounted via modules/registry at /api/assets, /api/contracts
app.use('/api/seed', seedRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/webhooks', webhookRouter);
app.use('/api/notifications', notificationsRouter);

// Module registry: mounts /api/{crm,support,finance,recruitment,marketing,knowledge-hub,time,okr,heart,executive}
await initializeModules(app);

// Health check
app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// DB health check (helps debug "Internal Server Error" on login when DB is down)
app.get('/api/health/db', async (_req, res) => {
  try {
    const { pool } = await import('./db/index.js');
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (e) {
    console.error('[health/db]', e);
    res.status(503).json({
      status: 'error',
      database: 'disconnected',
      message: e instanceof Error ? e.message : 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
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

registerAllSubscribers();
console.log('[Server] Event bus subscribers registered');

try {
  startAllWorkers();
  console.log('[Server] BullMQ workers started');
  void initDoraScheduler()
    .then(() => console.log('[Server] Dora scheduler repeatable jobs registered'))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[Server] Dora scheduler failed to register (Redis unavailable?):', message);
    });
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.warn('[Server] BullMQ workers failed to start (Redis unavailable?):', message);
  console.warn('[Server] Async jobs will not be processed. Events will still fire synchronously.');
}

// Start server
const port = process.env.PORT || 3001;
httpServer.listen(Number(port), '0.0.0.0', async () => {
  console.log(`🚀 Messign server running on port ${port}`);
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
  startBudgetAlertJob();
});

export { io };

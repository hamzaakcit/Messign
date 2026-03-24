import './env.js';
import { join, resolve } from 'path';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { setupSocketHandlers } from './sockets/index.js';
import { registerAllSubscribers } from './events/subscribers/index.js';
import { registerMarketingAutomationListeners } from './services/ai/marketing/automationListener.js';
import { stopJobQueue } from './services/jobQueue.js';
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
import { startMarketingPublisherCron } from './jobs/marketingPublisherCron.js';
import { requireAuth } from './middleware/requireAuth.js';
import aiV2Router from './routes/knowledge-hub/ai-v2.js';
import { optionalJwt } from './middleware/authMiddleware.js';
import { responseTimer } from './middleware/responseTimer.js';
import { initializeAuthRecords } from './services/initAuth.js';
import { initNewTables } from './db/initNewTables.js';

const app = express();
const httpServer = createServer(app);

// Behind Railway / reverse proxies: trust X-Forwarded-* so req.ip and JWT session fingerprint match real clients.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

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
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://editor.unlayer.com", "https://*.unlayer.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://editor.unlayer.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      connectSrc: ["'self'", "https:", "wss:", "ws:"],
      frameSrc: ["'self'", "https://editor.unlayer.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(cookieParser());
app.use(
  compression({
    threshold: 1024,
    filter: (req, res) => {
      const accept = String(req.headers.accept ?? '');
      if (accept.includes('text/event-stream')) return false;
      return compression.filter(req, res);
    },
  }),
);
app.use(express.json({ limit: '1mb', type: 'application/json' }));
if (process.env.NODE_ENV === 'production') {
  const resolvedUploadDir = resolve(UPLOAD_DIR);
  app.use('/uploads', optionalJwt, (req, res, next) => {
    if (!(req as express.Request & { userId?: string }).userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const safePath = resolve(resolvedUploadDir, req.path.replace(/^\//, ''));
    if (!safePath.startsWith(resolvedUploadDir)) {
      res.status(403).end();
      return;
    }
    res.sendFile(safePath, (err) => { if (err) next(err); });
  });
} else {
  app.use('/uploads', express.static(UPLOAD_DIR));
}
app.use(responseTimer);

// Health check — mounted before auth so monitoring tools can hit it without authentication
let healthCache: { json: object; status: number; expiresAt: number } | null = null;
const HEALTH_CACHE_MS = 5_000;

app.get('/health', async (_req, res) => {
  if (healthCache && Date.now() < healthCache.expiresAt) {
    res.status(healthCache.status).json(healthCache.json);
    return;
  }

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

  const coreOk = checks.database === 'ok' && checks.redis === 'ok';
  const allOk = Object.values(checks).every((v) => v === 'ok');
  const statusLabel = !coreOk ? 'unhealthy' : allOk ? 'healthy' : 'degraded';
  const statusCode = coreOk ? 200 : 503;
  const json = { status: statusLabel, checks, timestamp: new Date().toISOString() };

  healthCache = { json, status: statusCode, expiresAt: Date.now() + HEALTH_CACHE_MS };
  res.status(statusCode).json(json);
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
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/badges', requireAuth, badgesRouter);
app.use('/api/documents', requireAuth, documentsRouter);
app.use('/api/activities', requireAuth, activitiesRouter);
app.use('/api/leaderboard', requireAuth, leaderboardRouter);
app.use('/api/admin', adminRouter);
app.use('/api/categories', requireAuth, categoriesRouter);
app.use('/api/exchange-rates', requireAuth, exchangeRatesRouter);
app.use('/api/mileage', requireAuth, mileageRouter);
app.use('/api/settings/reimbursement', requireAuth, reimbursementSettingsRouter);
app.use('/api/signatures', requireAuth, signaturesRouter);
app.use('/api/performance', requireAuth, performanceRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/departments', requireAuth, departmentsRouter);
app.use('/api/bounties', requireAuth, bountiesRouter);
app.use('/api/sprints', requireAuth, sprintsRouter);
app.use('/api/showcase', requireAuth, showcaseRouter);
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

// Module registry: mounts /api/{crm,support,finance,hr,marketing,knowledge-hub,time,okr,heart,executive}
await initializeModules(app);

app.get('/api/health', async (_req, res) => {
  if (healthCache && Date.now() < healthCache.expiresAt) {
    res.status(healthCache.status).json(healthCache.json);
    return;
  }
  const checks: Record<string, 'ok' | 'error'> = {};
  try { const { pool } = await import('./db/index.js'); await pool.query('SELECT 1'); checks.database = 'ok'; } catch { checks.database = 'error'; }
  try { const { redisConnection } = await import('./queue/connection.js'); await redisConnection.ping(); checks.redis = 'ok'; } catch { checks.redis = 'error'; }
  const coreOk = checks.database === 'ok' && checks.redis === 'ok';
  const statusCode = coreOk ? 200 : 503;
  const json = { status: coreOk ? 'ready' : 'not_ready', checks, timestamp: new Date().toISOString() };
  healthCache = { json, status: statusCode, expiresAt: Date.now() + HEALTH_CACHE_MS };
  res.status(statusCode).json(json);
});

app.get('/health/live', (_req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

app.get('/health/ready', async (_req, res) => {
  const checks: Record<string, 'ok' | 'error'> = {};
  try { const { pool } = await import('./db/index.js'); await pool.query('SELECT 1'); checks.database = 'ok'; } catch { checks.database = 'error'; }
  try { const { redisConnection } = await import('./queue/connection.js'); await redisConnection.ping(); checks.redis = 'ok'; } catch { checks.redis = 'error'; }
  const ready = checks.database === 'ok' && checks.redis === 'ok';
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', checks, timestamp: new Date().toISOString() });
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
      timestamp: new Date().toISOString(),
    });
  }
});

// Global error handler: catch unhandled errors from async route handlers (Express 4 doesn't catch these)
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return;

  // AppError carries its own status code and error code
  if (err && typeof err === 'object' && 'statusCode' in err && 'code' in err) {
    const appErr = err as { statusCode: number; code: string; message: string };
    res.status(appErr.statusCode).json({
      success: false,
      error: { code: appErr.code, message: appErr.message },
    });
    if (appErr.statusCode >= 500) console.error('[server] AppError:', appErr.message);
    return;
  }

  console.error('[server] Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  });
});

app.set('io', io);
setupSocketHandlers(io);

registerAllSubscribers();
registerMarketingAutomationListeners();
console.log('[Server] Event bus subscribers registered');

const workersEnabled = process.env.ENABLE_WORKERS !== 'false';
if (workersEnabled) {
  try {
    const { startAllWorkers } = await import('./queue/workers/index.js');
    startAllWorkers();
    console.log('[Server] BullMQ workers started');
    const { initDoraScheduler } = await import('./services/finance/doraScheduler.js');
    void initDoraScheduler()
      .then(() => console.log('[Server] Dora scheduler repeatable jobs registered'))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[Server] Dora scheduler failed to register (Redis unavailable?):', message);
      });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[Server] BullMQ workers failed to start (Redis unavailable?):', message);
    console.warn('[Server] BullMQ async jobs will not be processed. Events will still fire synchronously.');
  }
} else {
  console.log('[Server] BullMQ workers disabled (ENABLE_WORKERS=false).');
}

/** Postgres-backed pg-boss (marketing batch + competitor scrape) — independent of Redis/BullMQ. */
const pgBossEnabled = process.env.ENABLE_PG_BOSS !== 'false';
if (pgBossEnabled) {
  try {
    // Prefer DATABASE_URL (private/direct) over DATABASE_PUBLIC_URL — pooler URLs (Neon PgBouncer
    // transaction mode, some proxies) break pg-boss long-lived workers. Override with PG_BOSS_DATABASE_URL.
    const pgBossUrl =
      process.env.PG_BOSS_DATABASE_URL?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      process.env.DATABASE_PUBLIC_URL?.trim() ||
      (process.env.NODE_ENV !== 'production' ? `postgresql://${process.env.USER}@localhost:5432/messign` : undefined);
    if (pgBossUrl) {
      const { startJobQueue } = await import('./services/jobQueue.js');
      const { registerBatchJobHandler } = await import('./services/marketing/batchService.js');
      await startJobQueue(pgBossUrl);
      await registerBatchJobHandler();

      try {
        const { registerScrapeJobHandler } = await import('./services/marketing/competitorScraper.js');
        const { callModelSafe } = await import('./services/ai/gateway.js');
        const { query: dbQuery } = await import('./db/index.js');
        const scraperLLM: Parameters<typeof registerScrapeJobHandler>[0] = async (params) => {
          const res = await callModelSafe({
            tier: 'fast',
            messages: [
              { role: 'system', content: params.systemPrompt },
              { role: 'user', content: params.userPrompt },
            ],
            tenantId: 'system',
            maxTokens: params.maxTokens ?? 250,
            temperature: 0.15,
          });
          return res.choices?.[0]?.message?.content?.trim() ?? '';
        };
        await registerScrapeJobHandler(scraperLLM, { query: dbQuery });
        console.log('[Server] Competitor scrape handler registered');
      } catch (scrapeErr) {
        console.warn('[Server] Competitor scrape handler failed (non-fatal):', scrapeErr instanceof Error ? scrapeErr.message : scrapeErr);
      }

      console.log('[Server] pg-boss job queue + batch handler initialized');
    } else {
      console.warn('[Server] pg-boss skipped: no DATABASE_URL / DATABASE_PUBLIC_URL');
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[Server] pg-boss init failed (non-fatal):', message);
  }
} else {
  console.log('[Server] pg-boss disabled (ENABLE_PG_BOSS=false). Marketing batch jobs and competitor scrape queue unavailable.');
}

let ragInterval: ReturnType<typeof setInterval> | undefined;
try {
  const { setupActionSchema } = await import('./services/ai/actions/actionStore.js');
  const { setupRagOutboxSchema, processRagOutboxBatch } = await import('./services/ai/sync/ragOutbox.js');
  await setupActionSchema();
  await setupRagOutboxSchema();
  ragInterval = setInterval(() => {
    void processRagOutboxBatch(8).catch((err: unknown) => {
      const m = err instanceof Error ? err.message : String(err);
      console.warn('[rag-outbox] batch:', m);
    });
  }, 20_000);
  console.log('[Server] Agentic schema + RAG outbox worker scheduled');
} catch (e) {
  console.warn('[Server] Agentic/outbox init:', e);
}

// Start server (root `package.json` `dev` waits on http://127.0.0.1:3001/api/health before Vite)
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
    const { warnOptionalMarketingSchemaIfMissing } = await import('./db/warnOptionalMarketingSchema.js');
    await warnOptionalMarketingSchemaIfMissing();
  } catch (e) {
    console.warn('[optionalMarketingSchema]', e);
  }
  try {
    await initializeAuthRecords();
  } catch (e) {
    console.warn('[initAuth]', e);
  }
  startBudgetAlertJob();
  startMarketingPublisherCron();
});

// Graceful shutdown
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, async () => {
    console.info(`[Server] ${signal} received, shutting down…`);
    if (ragInterval) clearInterval(ragInterval);

    try { io.close(); } catch { /* best-effort */ }
    try { await stopJobQueue(); } catch { /* best-effort */ }

    try {
      const { redisConnection } = await import('./queue/connection.js');
      await redisConnection.quit();
    } catch { /* best-effort */ }

    try {
      const { pool } = await import('./db/index.js');
      await pool.end();
    } catch { /* best-effort */ }

    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 15_000);
  });
}

export { io };

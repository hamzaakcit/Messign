/**
 * Messign AI Brain — Admin Monitoring Endpoints
 *
 * Mount at: /api/knowledge-hub/ai/admin
 * Protected by: requireAuth + admin role check
 *
 * Provides endpoints for:
 * - AI usage analytics
 * - Performance metrics
 * - Circuit breaker status
 * - Cache statistics
 * - Tool registry info
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getAIAnalytics } from '../../services/ai/queryLogger.js';
import { getPerformanceStats } from '../../services/ai/performanceMonitor.js';
import { getCircuitStatus, resetCircuit } from '../../services/ai/circuitBreaker.js';
import { getCacheStats, clearCache } from '../../services/ai/queryCache.js';
import { getAllTools, getToolCount } from '../../services/ai/tools/index.js';
import { getRateLimitStatus } from '../../middleware/aiRateLimit.js';

const router = Router();

/**
 * Middleware: Only admins can access these endpoints.
 */
function requireAdmin(req: Request & { user?: { id: string; role: string } }, res: Response, next: NextFunction): void {
  if (!req.user || !['admin', 'cpo'].includes(req.user.role)) {
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }
  next();
}

router.use(requireAdmin as any);

/**
 * GET /ai/admin/analytics?period=this_month
 * AI usage analytics dashboard data.
 */
router.get('/analytics', async (req: any, res: any) => {
  const period = (req.query.period as string) || 'this_month';
  const validPeriods = ['today', 'this_week', 'this_month', 'this_quarter'];

  if (!validPeriods.includes(period)) {
    return res.status(400).json({ error: `Invalid period. Use: ${validPeriods.join(', ')}` });
  }

  const analytics = await getAIAnalytics(period as 'today' | 'this_week' | 'this_month' | 'this_quarter');
  if (!analytics) {
    return res.status(500).json({ error: 'Failed to load analytics.' });
  }

  res.json(analytics);
});

/**
 * GET /ai/admin/performance
 * Real-time performance metrics.
 */
router.get('/performance', (req: any, res: any) => {
  const stats = getPerformanceStats();
  res.json(stats);
});

/**
 * GET /ai/admin/circuits
 * Circuit breaker status for all AI providers.
 */
router.get('/circuits', (req: any, res: any) => {
  const status = getCircuitStatus();
  res.json(status);
});

/**
 * POST /ai/admin/circuits/:provider/reset
 * Manually reset a circuit breaker for a provider.
 */
router.post('/circuits/:provider/reset', (req: any, res: any) => {
  const { provider } = req.params;
  if (!['groq', 'gemini', 'anthropic'].includes(provider)) {
    return res.status(400).json({ error: 'Invalid provider.' });
  }
  resetCircuit(provider);
  res.json({ message: `Circuit for ${provider} reset to CLOSED.` });
});

/**
 * GET /ai/admin/cache
 * Cache statistics.
 */
router.get('/cache', (req: any, res: any) => {
  const stats = getCacheStats();
  res.json(stats);
});

/**
 * POST /ai/admin/cache/clear
 * Clear the entire cache.
 */
router.post('/cache/clear', (req: any, res: any) => {
  clearCache();
  res.json({ message: 'Cache cleared.' });
});

/**
 * GET /ai/admin/tools
 * List all registered tools.
 */
router.get('/tools', (req: any, res: any) => {
  const tools = getAllTools().map(t => ({
    name: t.name,
    category: t.category,
    description: t.description.slice(0, 200),
    requiredRoles: t.requiredRoles || [],
    parameterCount: Object.keys(t.parameters.properties).length,
  }));

  res.json({
    totalTools: getToolCount(),
    tools,
  });
});

/**
 * GET /ai/admin/rate-limit/:userId
 * Check rate limit status for a specific user.
 */
router.get('/rate-limit/:userId', (req: any, res: any) => {
  const { userId } = req.params;
  const status = getRateLimitStatus(userId);
  res.json(status);
});

/**
 * GET /ai/admin/providers
 * API key configuration status (never exposes keys).
 */
router.get('/providers', (req: any, res: any) => {
  res.json({
    groq: { configured: !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()) },
    gemini: { configured: !!(process.env.GOOGLE_GEMINI_API_KEY && process.env.GOOGLE_GEMINI_API_KEY.trim()) },
    anthropic: { configured: !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim()) },
  });
});

/**
 * GET /ai/admin/health
 * Quick health check for the AI system.
 */
router.get('/health', (req: any, res: any) => {
  const circuits = getCircuitStatus();
  const cacheStats = getCacheStats();
  const perf = getPerformanceStats();
  const toolCount = getToolCount();

  const providersHealthy = Object.values(circuits).filter(c => c.state === 'closed').length;
  const providersTotal = Object.keys(circuits).length;

  const isHealthy =
    toolCount > 0 &&
    providersHealthy > 0 &&
    (perf.requestCount === 0 || perf.averages.total < 15000);

  res.json({
    status: isHealthy ? 'healthy' : 'degraded',
    toolsRegistered: toolCount,
    providers: {
      healthy: providersHealthy,
      total: providersTotal,
      details: circuits,
    },
    cache: {
      size: cacheStats.size,
      maxSize: cacheStats.maxSize,
      hitRate: cacheStats.size > 0 ? Math.round((cacheStats.totalHits / (cacheStats.totalHits + cacheStats.size)) * 100) : 0,
    },
    performance: {
      avgResponseMs: perf.averages.total,
      p95ResponseMs: perf.p95.total,
      recentRequests: perf.requestCount,
    },
  });
});

export default router;

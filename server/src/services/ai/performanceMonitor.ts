/**
 * Messign AI Brain — Performance Monitor
 *
 * Tracks timing for each stage of the AI pipeline:
 * - Router call (LLM tool selection)
 * - Tool execution (SQL queries)
 * - Synthesis call (LLM answer generation)
 * - Total end-to-end time
 *
 * Provides rolling averages and alerts when performance degrades.
 */

interface TimingEntry {
  timestamp: number;
  routerMs: number;
  toolsMs: number;
  synthesisMs: number;
  totalMs: number;
  toolCount: number;
}

// Rolling window of last 100 requests
const timingHistory: TimingEntry[] = [];
const MAX_HISTORY = 100;

// Alert thresholds (milliseconds)
const ALERT_THRESHOLDS = {
  router: 2000,      // Router call should be < 2s
  tools: 5000,        // Tool execution should be < 5s
  synthesis: 10000,   // Synthesis should be < 10s
  total: 15000,       // Total should be < 15s
};

/**
 * Record timing for a complete AI request.
 */
export function recordTiming(entry: {
  routerMs: number;
  toolsMs: number;
  synthesisMs: number;
  totalMs: number;
  toolCount: number;
}): void {
  timingHistory.push({
    ...entry,
    timestamp: Date.now(),
  });

  // Trim to max size
  if (timingHistory.length > MAX_HISTORY) {
    timingHistory.shift();
  }

  // Check for alerts
  checkAlerts(entry);
}

/**
 * Check if any stage exceeded its threshold and log a warning.
 */
function checkAlerts(entry: {
  routerMs: number;
  toolsMs: number;
  synthesisMs: number;
  totalMs: number;
}): void {
  if (entry.routerMs > ALERT_THRESHOLDS.router) {
    console.warn(`[Perf Monitor] SLOW ROUTER: ${entry.routerMs}ms (threshold: ${ALERT_THRESHOLDS.router}ms)`);
  }
  if (entry.toolsMs > ALERT_THRESHOLDS.tools) {
    console.warn(`[Perf Monitor] SLOW TOOLS: ${entry.toolsMs}ms (threshold: ${ALERT_THRESHOLDS.tools}ms)`);
  }
  if (entry.synthesisMs > ALERT_THRESHOLDS.synthesis) {
    console.warn(`[Perf Monitor] SLOW SYNTHESIS: ${entry.synthesisMs}ms (threshold: ${ALERT_THRESHOLDS.synthesis}ms)`);
  }
  if (entry.totalMs > ALERT_THRESHOLDS.total) {
    console.warn(`[Perf Monitor] SLOW TOTAL: ${entry.totalMs}ms (threshold: ${ALERT_THRESHOLDS.total}ms)`);
  }
}

/**
 * Get performance statistics (for admin dashboard).
 */
export function getPerformanceStats(): {
  requestCount: number;
  averages: { router: number; tools: number; synthesis: number; total: number };
  p95: { router: number; tools: number; synthesis: number; total: number };
  alertCount: { router: number; tools: number; synthesis: number; total: number };
} {
  if (timingHistory.length === 0) {
    const zero = { router: 0, tools: 0, synthesis: 0, total: 0 };
    return { requestCount: 0, averages: zero, p95: zero, alertCount: zero };
  }

  const count = timingHistory.length;

  // Averages
  const averages = {
    router: Math.round(timingHistory.reduce((s, e) => s + e.routerMs, 0) / count),
    tools: Math.round(timingHistory.reduce((s, e) => s + e.toolsMs, 0) / count),
    synthesis: Math.round(timingHistory.reduce((s, e) => s + e.synthesisMs, 0) / count),
    total: Math.round(timingHistory.reduce((s, e) => s + e.totalMs, 0) / count),
  };

  // P95 (95th percentile)
  const p95Index = Math.floor(count * 0.95);
  const sortedRouter = [...timingHistory].sort((a, b) => a.routerMs - b.routerMs);
  const sortedTools = [...timingHistory].sort((a, b) => a.toolsMs - b.toolsMs);
  const sortedSynth = [...timingHistory].sort((a, b) => a.synthesisMs - b.synthesisMs);
  const sortedTotal = [...timingHistory].sort((a, b) => a.totalMs - b.totalMs);

  const p95 = {
    router: sortedRouter[p95Index]?.routerMs ?? 0,
    tools: sortedTools[p95Index]?.toolsMs ?? 0,
    synthesis: sortedSynth[p95Index]?.synthesisMs ?? 0,
    total: sortedTotal[p95Index]?.totalMs ?? 0,
  };

  // Alert counts
  const alertCount = {
    router: timingHistory.filter(e => e.routerMs > ALERT_THRESHOLDS.router).length,
    tools: timingHistory.filter(e => e.toolsMs > ALERT_THRESHOLDS.tools).length,
    synthesis: timingHistory.filter(e => e.synthesisMs > ALERT_THRESHOLDS.synthesis).length,
    total: timingHistory.filter(e => e.totalMs > ALERT_THRESHOLDS.total).length,
  };

  return { requestCount: count, averages, p95, alertCount };
}

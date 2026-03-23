import { Router } from 'express';
import puppeteer from 'puppeteer';
import { reimbursementAuth, type ReimbursementRequest } from '../../middleware/reimbursementAuth.js';
import type { CallerContext } from '../../dal/types.js';
import {
  AVAILABLE_REPORT_TYPES,
  generateReport,
  type ReportRequest,
  type ReportResult,
  type ReportType,
} from '../../dal/reports/reportGenerator.js';
import { redisConnection } from '../../queue/connection.js';

const reportsRouter = Router();
const REPORT_CACHE_TTL = 60;
const reportHistoryByScope = new Map<string, ReportResult[]>();
const MAX_REPORT_HISTORY_KEYS = 200;

function buildCtx(req: ReimbursementRequest): CallerContext {
  const user = req.reimbursementUser!;
  return {
    userId: user.id,
    role: user.role as CallerContext['role'],
    organizationId: req.organizationId,
  };
}

function scopeKey(req: ReimbursementRequest): string {
  return `${req.organizationId ?? 'no-org'}:${req.reimbursementUser?.id ?? 'unknown-user'}`;
}

function pushReportHistory(req: ReimbursementRequest, report: ReportResult): void {
  const key = scopeKey(req);
  const current = reportHistoryByScope.get(key) ?? [];
  current.unshift(report);
  if (current.length > 50) current.splice(50);
  reportHistoryByScope.set(key, current);

  if (reportHistoryByScope.size > MAX_REPORT_HISTORY_KEYS) {
    const oldest = reportHistoryByScope.keys().next();
    if (!oldest.done) reportHistoryByScope.delete(oldest.value);
  }
}

function toCsvRows(data: unknown[]): string {
  if (!data.length) return 'No data';
  const first = data[0] as Record<string, unknown>;
  const headers = Object.keys(first);
  const lines = [headers.join(',')];
  for (const row of data as Array<Record<string, unknown>>) {
    const vals = headers.map((h) => {
      const raw = row[h];
      const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
      return `"${String(text).replaceAll('"', '""')}"`;
    });
    lines.push(vals.join(','));
  }
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function makePdf(report: ReportResult): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <html>
      <body style="font-family:Arial,sans-serif;padding:24px">
        <h1>${escapeHtml(report.title)}</h1>
        <p>${escapeHtml(report.description)}</p>
        <p><strong>Generated:</strong> ${escapeHtml(report.generatedAt)}</p>
        <pre style="white-space:pre-wrap">${escapeHtml(JSON.stringify(report.data, null, 2))}</pre>
      </body>
      </html>
    `);
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

reportsRouter.use(reimbursementAuth);

reportsRouter.get('/types', (_req, res) => {
  res.json(AVAILABLE_REPORT_TYPES);
});

function reportCacheKey(req: ReimbursementRequest, type: string, period?: { from: string; to: string }, departmentId?: string): string {
  const org = req.organizationId ?? 'no-org';
  const user = req.reimbursementUser?.id ?? 'unknown';
  const p = period ? `${period.from}_${period.to}` : 'default';
  const dept = departmentId ?? 'all';
  return `report_${org}_${user}_${type}_${p}_${dept}`;
}

reportsRouter.post('/generate', async (req: ReimbursementRequest, res) => {
  try {
    const body = req.body as ReportRequest;
    const cacheKey = reportCacheKey(req, body.type ?? 'unknown', body.period, body.departmentId);
    try {
      const cached = await redisConnection.get(cacheKey);
      if (cached) {
        const report = JSON.parse(cached) as ReportResult;
        pushReportHistory(req, report);
        return res.json(report);
      }
    } catch (e) {
      if (e instanceof Error) console.warn('[Redis] report cache get:', e.message);
    }
    const report = await generateReport(buildCtx(req), body);
    pushReportHistory(req, report);
    try {
      await redisConnection.setex(cacheKey, REPORT_CACHE_TTL, JSON.stringify(report));
    } catch (e) {
      if (e instanceof Error) console.warn('[Redis] report cache set:', e.message);
    }
    res.json(report);
  } catch (error) {
    console.error('[reports/generate]', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

reportsRouter.get('/generate/:type', async (req: ReimbursementRequest, res) => {
  try {
    const period = (req.query.from && req.query.to)
      ? { from: String(req.query.from), to: String(req.query.to) }
      : undefined;
    const departmentId = req.query.departmentId ? String(req.query.departmentId) : undefined;
    const cacheKey = reportCacheKey(req, req.params.type, period, departmentId);
    try {
      const cached = await redisConnection.get(cacheKey);
      if (cached) {
        const report = JSON.parse(cached) as ReportResult;
        pushReportHistory(req, report);
        return res.json(report);
      }
    } catch (e) {
      if (e instanceof Error) console.warn('[Redis] report cache get:', e.message);
    }
    const report = await generateReport(buildCtx(req), {
      type: req.params.type as ReportType,
      format: 'json',
      period,
      departmentId,
      filters: {},
    });
    pushReportHistory(req, report);
    try {
      await redisConnection.setex(cacheKey, REPORT_CACHE_TTL, JSON.stringify(report));
    } catch (e) {
      if (e instanceof Error) console.warn('[Redis] report cache set:', e.message);
    }
    res.json(report);
  } catch (error) {
    console.error('[reports/generate/:type]', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

reportsRouter.post('/export/csv', async (req: ReimbursementRequest, res) => {
  try {
    const report = await generateReport(buildCtx(req), { ...(req.body as ReportRequest), format: 'csv' });
    const tabular = report.sections.find((s) => s.type === 'table')?.data as unknown[] | undefined;
    const csv = toCsvRows(Array.isArray(tabular) ? tabular : [report.data]);
    const name = `${report.type}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(csv);
  } catch (error) {
    console.error('[reports/export/csv]', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

reportsRouter.post('/export/pdf', async (req: ReimbursementRequest, res) => {
  try {
    const report = await generateReport(buildCtx(req), { ...(req.body as ReportRequest), format: 'pdf' });
    const pdf = await makePdf(report);
    const name = `${report.type}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(pdf);
  } catch (error) {
    console.error('[reports/export/pdf]', error);
    res.status(500).json({ error: 'Failed to export PDF' });
  }
});

reportsRouter.get('/history', (req: ReimbursementRequest, res) => {
  res.json(reportHistoryByScope.get(scopeKey(req)) ?? []);
});

export default reportsRouter;

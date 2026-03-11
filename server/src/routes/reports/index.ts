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

const reportsRouter = Router();
const reportHistory: ReportResult[] = [];

function buildCtx(req: ReimbursementRequest): CallerContext {
  const user = req.reimbursementUser!;
  return {
    userId: user.id,
    role: user.role as CallerContext['role'],
    organizationId: req.organizationId,
  };
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

async function makePdf(report: ReportResult): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <html>
      <body style="font-family:Arial,sans-serif;padding:24px">
        <h1>${report.title}</h1>
        <p>${report.description}</p>
        <p><strong>Generated:</strong> ${report.generatedAt}</p>
        <pre style="white-space:pre-wrap">${JSON.stringify(report.data, null, 2)}</pre>
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

reportsRouter.post('/generate', async (req: ReimbursementRequest, res) => {
  try {
    const report = await generateReport(buildCtx(req), req.body as ReportRequest);
    reportHistory.unshift(report);
    reportHistory.splice(50);
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
    const report = await generateReport(buildCtx(req), {
      type: req.params.type as ReportType,
      format: 'json',
      period,
      departmentId: req.query.departmentId ? String(req.query.departmentId) : undefined,
      filters: {},
    });
    reportHistory.unshift(report);
    reportHistory.splice(50);
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

reportsRouter.get('/history', (_req, res) => {
  res.json(reportHistory);
});

export default reportsRouter;

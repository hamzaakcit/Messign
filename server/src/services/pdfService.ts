import puppeteer from 'puppeteer';
import { query } from '../db/index.js';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const INVOICE_DIR = join(UPLOAD_DIR, 'invoices');

const COMPANY = {
  name: process.env.COMPANY_NAME || 'Messign Communications',
  address: process.env.COMPANY_ADDRESS || 'Delaware, USA',
  regNumber: process.env.COMPANY_REG_NUMBER || '13799611524',
  vatNumber: process.env.COMPANY_VAT_NUMBER || '030319941',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);

const fmtOrig = (n: number, cur: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(n);

export async function generateInvoicePdf(invoiceId: string): Promise<string> {
  // Ensure directory
  if (!existsSync(INVOICE_DIR)) mkdirSync(INVOICE_DIR, { recursive: true });

  // Fetch invoice
  const invResult = await query(
    `SELECT i.*, u.full_name AS employee_name, u.email AS employee_email,
            u.job_title AS employee_job_title
     FROM invoices i
     JOIN reimbursement_users u ON u.id = i.employee_id
     WHERE i.id = $1`,
    [invoiceId]
  );
  const inv = invResult.rows[0];
  if (!inv) throw new Error('Invoice not found');

  // Fetch line items
  const itemsResult = await query<{ description: string; amount_eur: string; original_amount?: string; original_currency?: string; sort_order: number }>(
    `SELECT * FROM invoice_line_items WHERE invoice_id = $1 ORDER BY sort_order`,
    [invoiceId]
  );
  const items = itemsResult.rows;

  // Fetch bank details
  const bankResult = await query(
    `SELECT * FROM bank_details WHERE user_id = $1`,
    [inv.employee_id]
  );
  const bank = bankResult.rows[0];

  // Fetch signature
  const sigResult = await query(
    `SELECT signature_data FROM signatures WHERE user_id = $1`,
    [inv.employee_id]
  );
  const signature = sigResult.rows[0]?.signature_data;

  const periodLabel = new Date(inv.period_year, inv.period_month - 1).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });

  // Build HTML
  const html = renderInvoiceHtml({
    invoiceNumber: inv.invoice_number,
    generatedDate: inv.generated_date instanceof Date ? inv.generated_date.toISOString().slice(0, 10) : String(inv.generated_date).slice(0, 10),
    dueDate: inv.due_date instanceof Date ? inv.due_date.toISOString().slice(0, 10) : String(inv.due_date).slice(0, 10),
    periodLabel,
    employeeName: inv.employee_name,
    employeeJobTitle: inv.employee_job_title || '',
    employeeEmail: inv.employee_email || '',
    bank,
    items,
    baseRetainer: parseFloat(inv.base_retainer),
    totalExpenses: parseFloat(inv.total_expenses),
    grandTotal: parseFloat(inv.grand_total),
    signature,
  });

  // Generate PDF
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfPath = join(INVOICE_DIR, `${inv.invoice_number}.pdf`);
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
  });

  await browser.close();
  return pdfPath;
}

interface InvoiceData {
  invoiceNumber: string;
  generatedDate: string;
  dueDate: string;
  periodLabel: string;
  employeeName: string;
  employeeJobTitle: string;
  employeeEmail: string;
  bank: { bank_name?: string; iban?: string; swift_bic?: string; account_holder?: string } | undefined;
  items: { description: string; amount_eur: string; original_amount?: string; original_currency?: string }[];
  baseRetainer: number;
  totalExpenses: number;
  grandTotal: number;
  signature?: string;
}

function renderInvoiceHtml(data: InvoiceData): string {
  const expenseCount = data.items.length > 0 ? data.items.length - 1 : 0; // first item is base retainer

  const lineItemsHtml = data.items
    .map((item) => {
      const eurAmt = parseFloat(item.amount_eur);
      const origAmt = item.original_amount ? parseFloat(item.original_amount) : null;
      const origCur = item.original_currency;
      return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #475569; font-size: 13px;">
            ${escHtml(item.description)}
            ${origAmt && origCur ? `<span style="font-size: 11px; color: #94a3b8;"> (orig: ${fmtOrig(origAmt, origCur)})</span>` : ''}
          </td>
          <td style="padding: 10px 0; text-align: right; font-size: 13px; font-weight: 600;">${fmt(eurAmt)}</td>
        </tr>`;
    })
    .join('');

  const bankHtml = data.bank
    ? `<div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
        ${data.bank.bank_name ? escHtml(data.bank.bank_name) + '<br/>' : ''}
        ${data.bank.iban ? 'IBAN: ' + escHtml(data.bank.iban) + '<br/>' : ''}
        ${data.bank.swift_bic ? 'SWIFT: ' + escHtml(data.bank.swift_bic) : ''}
       </div>`
    : '';

  const signatureHtml = data.signature
    ? `<div style="margin-top: 32px; border-top: 1px solid #e8ecf1; padding-top: 20px;">
        <div style="display: flex; justify-content: flex-end;">
          <div style="text-align: center;">
            <img src="${data.signature}" alt="Signature" style="max-height: 50px; margin-bottom: 4px;" />
            <div style="border-top: 1px solid #1a2332; padding-top: 4px; font-size: 12px; font-weight: 600;">${escHtml(data.employeeName)}</div>
            <div style="font-size: 10px; color: #94a3b8;">Digital Signature</div>
          </div>
        </div>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a2332; line-height: 1.5; }
  </style>
</head>
<body style="padding: 0;">
  <div style="max-width: 640px; margin: 0 auto;">
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="18" width="8" height="18" rx="4" fill="#00D9D5"/>
          <rect x="16" y="12" width="8" height="24" rx="4" fill="#3B82F6"/>
          <rect x="28" y="6" width="8" height="30" rx="4" fill="#8B5CF6"/>
        </svg>
        <div>
          <div style="font-size: 20px; font-weight: 800; color: #1a2332;">Messign</div>
          <div style="font-size: 10px; color: #94a3b8; letter-spacing: 0.08em; text-transform: uppercase;">Communications</div>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 24px; font-weight: 800; color: #1a2332; letter-spacing: -0.02em;">INVOICE</div>
        <div style="font-family: monospace; font-size: 14px; font-weight: 600; color: #6B8DF2;">${escHtml(data.invoiceNumber)}</div>
      </div>
    </div>

    <!-- From (contractor) / Bill To (Messign) -->
    <div style="display: flex; gap: 32px; margin-bottom: 28px;">
      <div style="flex: 1;">
        <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">From</div>
        <div style="font-size: 13px; font-weight: 700;">${escHtml(data.employeeName)}</div>
        <div style="font-size: 12px; color: #64748b;">${escHtml(data.employeeJobTitle)}</div>
        ${bankHtml}
      </div>
      <div style="flex: 1;">
        <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">Bill To</div>
        <div style="font-size: 13px; font-weight: 700;">${escHtml(COMPANY.name)}</div>
        <div style="font-size: 12px; color: #64748b;">${escHtml(COMPANY.address)}</div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
          Reg: ${escHtml(COMPANY.regNumber)}<br/>
          VAT: ${escHtml(COMPANY.vatNumber)}
        </div>
      </div>
    </div>

    <!-- Invoice Details -->
    <div style="display: flex; gap: 12px; margin-bottom: 28px; padding: 14px 16px; background: #f8fafc; border-radius: 8px;">
      <div style="flex: 1;">
        <div style="font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase;">Invoice Date</div>
        <div style="font-size: 13px; font-weight: 600;">${escHtml(data.generatedDate)}</div>
      </div>
      <div style="flex: 1;">
        <div style="font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase;">Period</div>
        <div style="font-size: 13px; font-weight: 600;">${escHtml(data.periodLabel)}</div>
      </div>
      <div style="flex: 1;">
        <div style="font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase;">Currency</div>
        <div style="font-size: 13px; font-weight: 600;">EUR</div>
      </div>
    </div>

    <!-- Line Items -->
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px;">
      <thead>
        <tr style="border-bottom: 2px solid #e2e8f0;">
          <th style="padding: 8px 0; text-align: left; font-weight: 700; font-size: 10px; color: #94a3b8; text-transform: uppercase;">Description</th>
          <th style="padding: 8px 0; text-align: right; font-weight: 700; font-size: 10px; color: #94a3b8; text-transform: uppercase;">Amount (EUR)</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
      </tbody>
    </table>

    <!-- Totals -->
    <div style="border-top: 2px solid #1a2332; padding-top: 12px; display: flex; justify-content: flex-end;">
      <div style="width: 250px;">
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px;">
          <span style="color: #64748b;">Consultation Fee</span>
          <span style="font-weight: 600;">${fmt(data.baseRetainer)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px;">
          <span style="color: #64748b;">Expenses (${expenseCount} items)</span>
          <span style="font-weight: 600;">${fmt(data.totalExpenses)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 10px 0; font-size: 16px; font-weight: 800; border-top: 1px solid #e2e8f0; margin-top: 4px;">
          <span>Total Due</span>
          <span style="color: #1D4ED8;">${fmt(data.grandTotal)}</span>
        </div>
      </div>
    </div>

    ${signatureHtml}

    <!-- Footer -->
    <div style="margin-top: 28px; padding-top: 16px; border-top: 1px solid #f1f5f9; text-align: center;">
      <div style="font-size: 10px; color: #94a3b8;">
        ${escHtml(COMPANY.name)} · ${escHtml(COMPANY.address)} · Reg: ${escHtml(COMPANY.regNumber)} · VAT: ${escHtml(COMPANY.vatNumber)}
      </div>
    </div>
  </div>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

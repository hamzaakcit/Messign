import puppeteer from 'puppeteer';
import { query } from '../../db/index.js';

interface InvoiceForPdf {
  id: string;
  invoice_number: string;
  invoice_type: string;
  status: string;
  from_name: string;
  from_email?: string;
  from_address?: string;
  to_name: string;
  to_email?: string;
  to_address?: string;
  to_tax_id?: string;
  currency: string;
  subtotal: string;
  tax_amount: string;
  discount_amount: string;
  discount_pct?: string;
  grand_total: string;
  amount_paid: string;
  payment_terms?: string;
  payment_instructions?: string;
  notes?: string;
  created_at: string;
  due_date?: string;
  sent_at?: string;
  line_items: Array<{
    description: string;
    quantity: string;
    unit_price: string;
    tax_rate: string;
    line_total: string;
  }>;
}

function esc(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function money(n: number | string, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number(n));
}

function renderHtml(inv: InvoiceForPdf): string {
  const cur = inv.currency || 'USD';
  const subtotal = parseFloat(inv.subtotal || '0');
  const taxAmount = parseFloat(inv.tax_amount || '0');
  const discount = parseFloat(inv.discount_amount || '0');
  const grandTotal = parseFloat(inv.grand_total || '0');
  const amountPaid = parseFloat(inv.amount_paid || '0');
  const balanceDue = grandTotal - amountPaid;

  const invoiceDate = inv.sent_at
    ? new Date(inv.sent_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date(inv.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const dueDate = inv.due_date
    ? new Date(inv.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const lineItemsHtml = (inv.line_items || [])
    .map((li) => {
      const qty = parseFloat(li.quantity || '1');
      const price = parseFloat(li.unit_price || '0');
      const tax = parseFloat(li.tax_rate || '0');
      const total = parseFloat(li.line_total || '0');
      return `
        <tr>
          <td style="padding: 12px 0; color: #334155; border-bottom: 1px solid #f1f5f9;">${esc(li.description)}</td>
          <td style="padding: 12px 0; text-align: center; color: #475569; border-bottom: 1px solid #f1f5f9;">${qty}</td>
          <td style="padding: 12px 0; text-align: right; color: #475569; border-bottom: 1px solid #f1f5f9;">${money(price, cur)}</td>
          <td style="padding: 12px 0; text-align: right; color: #475569; border-bottom: 1px solid #f1f5f9;">${tax > 0 ? tax + '%' : '—'}</td>
          <td style="padding: 12px 0; text-align: right; font-weight: 600; color: #1e293b; border-bottom: 1px solid #f1f5f9;">${money(total, cur)}</td>
        </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; line-height: 1.6; font-size: 13px; }
    table { border-collapse: collapse; }
  </style>
</head>
<body style="padding: 0;">
  <div style="max-width: 680px; margin: 0 auto;">

    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="18" width="8" height="18" rx="4" fill="#00D9D5"/>
          <rect x="16" y="12" width="8" height="24" rx="4" fill="#3B82F6"/>
          <rect x="28" y="6" width="8" height="30" rx="4" fill="#8B5CF6"/>
        </svg>
        <div>
          <div style="font-size: 22px; font-weight: 800; color: #1e293b;">Messign</div>
          <div style="font-size: 10px; color: #94a3b8; letter-spacing: 0.08em; text-transform: uppercase;">Communications</div>
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 28px; font-weight: 800; color: #1e293b; letter-spacing: -0.02em;">INVOICE</div>
        <div style="font-family: monospace; font-size: 15px; font-weight: 600; color: #6366f1;">${esc(inv.invoice_number)}</div>
      </div>
    </div>

    <!-- From / To -->
    <div style="display: flex; gap: 40px; margin-bottom: 32px;">
      <div style="flex: 1;">
        <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">From</div>
        <div style="font-weight: 700; font-size: 14px;">${esc(inv.from_name)}</div>
        ${inv.from_email ? `<div style="font-size: 12px; color: #64748b;">${esc(inv.from_email)}</div>` : ''}
        ${inv.from_address ? `<div style="font-size: 12px; color: #64748b; white-space: pre-line;">${esc(inv.from_address)}</div>` : ''}
      </div>
      <div style="flex: 1;">
        <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px;">Bill To</div>
        <div style="font-weight: 700; font-size: 14px;">${esc(inv.to_name)}</div>
        ${inv.to_email ? `<div style="font-size: 12px; color: #64748b;">${esc(inv.to_email)}</div>` : ''}
        ${inv.to_address ? `<div style="font-size: 12px; color: #64748b; white-space: pre-line;">${esc(inv.to_address)}</div>` : ''}
        ${inv.to_tax_id ? `<div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Tax ID: ${esc(inv.to_tax_id)}</div>` : ''}
      </div>
    </div>

    <!-- Invoice Meta -->
    <div style="display: flex; gap: 16px; margin-bottom: 32px; padding: 14px 20px; background: #f8fafc; border-radius: 8px;">
      <div style="flex: 1;">
        <div style="font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase;">Invoice Date</div>
        <div style="font-weight: 600;">${invoiceDate}</div>
      </div>
      ${dueDate ? `
      <div style="flex: 1;">
        <div style="font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase;">Due Date</div>
        <div style="font-weight: 600;">${dueDate}</div>
      </div>` : ''}
      <div style="flex: 1;">
        <div style="font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase;">Payment Terms</div>
        <div style="font-weight: 600;">${esc(inv.payment_terms) || 'Net 30'}</div>
      </div>
      <div style="flex: 1;">
        <div style="font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase;">Currency</div>
        <div style="font-weight: 600;">${cur}</div>
      </div>
    </div>

    <!-- Line Items -->
    <table style="width: 100%; margin-bottom: 24px;">
      <thead>
        <tr style="border-bottom: 2px solid #e2e8f0;">
          <th style="padding: 10px 0; text-align: left; font-weight: 700; font-size: 10px; color: #94a3b8; text-transform: uppercase;">Description</th>
          <th style="padding: 10px 0; text-align: center; font-weight: 700; font-size: 10px; color: #94a3b8; text-transform: uppercase;">Qty</th>
          <th style="padding: 10px 0; text-align: right; font-weight: 700; font-size: 10px; color: #94a3b8; text-transform: uppercase;">Unit Price</th>
          <th style="padding: 10px 0; text-align: right; font-weight: 700; font-size: 10px; color: #94a3b8; text-transform: uppercase;">Tax</th>
          <th style="padding: 10px 0; text-align: right; font-weight: 700; font-size: 10px; color: #94a3b8; text-transform: uppercase;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHtml}
      </tbody>
    </table>

    <!-- Totals -->
    <div style="display: flex; justify-content: flex-end;">
      <div style="width: 280px;">
        <div style="display: flex; justify-content: space-between; padding: 6px 0;">
          <span style="color: #64748b;">Subtotal</span>
          <span style="font-weight: 600;">${money(subtotal, cur)}</span>
        </div>
        ${taxAmount > 0 ? `
        <div style="display: flex; justify-content: space-between; padding: 6px 0;">
          <span style="color: #64748b;">Tax</span>
          <span style="font-weight: 600;">${money(taxAmount, cur)}</span>
        </div>` : ''}
        ${discount > 0 ? `
        <div style="display: flex; justify-content: space-between; padding: 6px 0;">
          <span style="color: #64748b;">Discount${inv.discount_pct ? ` (${inv.discount_pct}%)` : ''}</span>
          <span style="font-weight: 600; color: #16a34a;">-${money(discount, cur)}</span>
        </div>` : ''}
        <div style="display: flex; justify-content: space-between; padding: 12px 0; font-size: 16px; font-weight: 800; border-top: 2px solid #1e293b; margin-top: 4px;">
          <span>Total</span>
          <span>${money(grandTotal, cur)}</span>
        </div>
        ${amountPaid > 0 ? `
        <div style="display: flex; justify-content: space-between; padding: 6px 0; color: #16a34a;">
          <span>Paid</span>
          <span style="font-weight: 600;">-${money(amountPaid, cur)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px; font-weight: 800; border-top: 1px solid #e2e8f0;">
          <span>Balance Due</span>
          <span style="color: #dc2626;">${money(balanceDue, cur)}</span>
        </div>` : ''}
      </div>
    </div>

    <!-- Notes -->
    ${inv.notes ? `
    <div style="margin-top: 32px; padding: 16px 20px; background: #f8fafc; border-radius: 8px;">
      <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px;">Notes</div>
      <div style="color: #475569; white-space: pre-line;">${esc(inv.notes)}</div>
    </div>` : ''}

    <!-- Payment Instructions -->
    ${inv.payment_instructions ? `
    <div style="margin-top: 16px; padding: 16px 20px; background: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd;">
      <div style="font-size: 10px; font-weight: 700; color: #0284c7; text-transform: uppercase; margin-bottom: 6px;">Payment Instructions</div>
      <div style="color: #0369a1; white-space: pre-line;">${esc(inv.payment_instructions)}</div>
    </div>` : ''}

    <!-- Footer -->
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #f1f5f9; text-align: center;">
      <div style="font-size: 10px; color: #94a3b8;">
        Messign Communications &middot; Delaware, USA
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function generateFinanceInvoicePdf(invoiceId: string, orgId: string): Promise<Buffer> {
  const invResult = await query(
    `SELECT i.*,
       ARRAY_AGG(json_build_object(
         'description', ili.description, 'quantity', ili.quantity,
         'unit_price', ili.unit_price, 'tax_rate', ili.tax_rate, 'line_total', ili.line_total
       ) ORDER BY ili.sort_order) as line_items
     FROM invoices i
     LEFT JOIN invoice_line_items ili ON ili.invoice_id = i.id
     WHERE i.id = $1 AND i.organization_id = $2
     GROUP BY i.id`,
    [invoiceId, orgId],
  );

  const inv = invResult.rows[0] as InvoiceForPdf | undefined;
  if (!inv) throw new Error('Invoice not found');

  if (inv.line_items && inv.line_items.length === 1 && inv.line_items[0].description === null) {
    inv.line_items = [];
  }

  const html = renderHtml(inv);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
  });

  await browser.close();
  return Buffer.from(pdfBuffer);
}

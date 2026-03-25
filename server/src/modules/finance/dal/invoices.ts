import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../../db/index.js';
import { eventBus } from '../../../events/index.js';
import type { CallerContext, PaginatedResult, SortOptions } from '../../../dal/types.js';
import { rbacWhereClause, paginationClause } from '../../../dal/helpers.js';

const runInTenant = <T>(tenantId: string, fn: (client: PoolClient) => Promise<T>) =>
  withTenantQuery(tenantId, fn);

// ── Interfaces ──

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_total: number;
  amount_eur: number | null;
  original_amount: number | null;
  original_currency: string | null;
  sort_order: number;
}

export interface Invoice {
  id: string;
  organization_id: string;
  employee_id: string | null;
  invoice_number: string;
  invoice_type: string;
  status: string;
  period_year: number | null;
  period_month: number | null;
  generated_date: string | null;
  due_date: string | null;
  from_name: string;
  from_email: string | null;
  from_address: string | null;
  to_name: string;
  to_email: string | null;
  to_address: string | null;
  client_id: string | null;
  vendor_id: string | null;
  currency: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  discount_pct: number | null;
  grand_total: number;
  total_amount: number;
  amount_paid: number;
  payment_terms: string | null;
  payment_instructions: string | null;
  notes: string | null;
  internal_notes: string | null;
  tags: string[] | null;
  template_id: string | null;
  sent_at: string | null;
  is_deleted: boolean | null;
  created_at: string;
  updated_at: string;
  line_items?: InvoiceLineItem[] | unknown[];
}

export interface CreateInvoiceInput {
  invoice_type?: string;
  from_name: string;
  from_email?: string;
  from_address?: string;
  to_name: string;
  to_email?: string;
  to_address?: string;
  client_id?: string;
  vendor_id?: string;
  currency?: string;
  payment_terms?: string;
  payment_instructions?: string;
  due_date?: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate?: number;
  }>;
  discount_pct?: number;
  discount_amount?: number;
  notes?: string;
  internal_notes?: string;
  tags?: string[];
  template_id?: string;
}

export type UpdateInvoiceInput = Partial<CreateInvoiceInput>;

export interface InvoiceFilters {
  status?: string;
  search?: string;
}

// ── Helpers (internal, use client from runInTenant) ──

async function fetchInvoiceById(client: PoolClient, invoiceId: string): Promise<Invoice | null> {
  const result = await client.query(
    `SELECT i.*,
            COALESCE(
              (SELECT json_agg(json_build_object(
                'id', ili.id, 'description', ili.description,
                'quantity', ili.quantity, 'unit_price', ili.unit_price,
                'tax_rate', ili.tax_rate, 'line_total', ili.line_total
              ) ORDER BY ili.sort_order)
              FROM invoice_line_items ili WHERE ili.invoice_id = i.id),
              '[]'::json
            ) as line_items
     FROM invoices i
     WHERE i.id = $1`,
    [invoiceId],
  );
  return (result.rows[0] as Invoice) ?? null;
}

// ── DAL Functions ──

export async function listInvoices(
  ctx: CallerContext,
  filters?: InvoiceFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Invoice>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listInvoices');

  const conditions = ['(i.is_deleted IS NULL OR i.is_deleted = FALSE)'];
  const params: unknown[] = [];
  let idx = 1;

  const rbac = rbacWhereClause(ctx, 'i.employee_id', 'i.organization_id', idx);
  if (rbac.clause !== '1=1') {
    conditions.push(rbac.clause);
    params.push(...rbac.params);
    idx += rbac.params.length;
  }

  if (filters?.status) {
    conditions.push(`i.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.search) {
    conditions.push(`(i.to_name ILIKE $${idx} OR i.from_name ILIKE $${idx} OR i.invoice_number ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  const whereSQL = conditions.join(' AND ');

  const sortCol: Record<string, string> = {
    date: 'i.created_at', amount: 'i.grand_total',
    status: 'i.status', due_date: 'i.due_date',
  };
  const orderBy = sortCol[sort?.field ?? 'date'] ?? 'i.created_at';
  const orderDir = sort?.direction === 'asc' ? 'ASC' : 'DESC';

  const pg = paginationClause(page, pageSize, idx);

  return runInTenant(tenantId, async (client) => {
    const countResult = await client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM invoices i WHERE ${whereSQL}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const dataResult = await client.query(
      `SELECT i.*,
              COALESCE(
                (SELECT json_agg(json_build_object(
                  'id', ili.id, 'description', ili.description,
                  'quantity', ili.quantity, 'unit_price', ili.unit_price,
                  'tax_rate', ili.tax_rate, 'line_total', ili.line_total
                ) ORDER BY ili.sort_order)
                FROM invoice_line_items ili WHERE ili.invoice_id = i.id),
                '[]'::json
              ) as line_items
       FROM invoices i
       WHERE ${whereSQL}
       ORDER BY ${orderBy} ${orderDir}
       ${pg.clause}`,
      [...params, ...pg.params],
    );

    return {
      data: dataResult.rows as Invoice[],
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  });
}

export async function getInvoiceById(
  ctx: CallerContext,
  invoiceId: string,
): Promise<Invoice | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getInvoiceById');

  return runInTenant(tenantId, (client) => fetchInvoiceById(client, invoiceId));
}

export async function createInvoice(
  ctx: CallerContext,
  data: CreateInvoiceInput,
): Promise<Invoice> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for createInvoice');

  return runInTenant(tenantId, async (client) => {
    const subtotal = data.line_items.reduce((s, li) => s + li.quantity * li.unit_price, 0);
    const taxTotal = data.line_items.reduce(
      (s, li) => s + (li.tax_rate ? li.quantity * li.unit_price * li.tax_rate / 100 : 0), 0,
    );
    const discountAmt = data.discount_amount ?? (data.discount_pct ? subtotal * data.discount_pct / 100 : 0);
    const grandTotal = subtotal + taxTotal - discountAmt;
    const currency = (data.currency ?? 'USD').toUpperCase().slice(0, 3);

    const numResult = await client.query<{ next_num: string }>(
      `SELECT COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) + 1 as next_num
       FROM invoices`,
    );
    const invNumber = `INV-${String(numResult.rows[0]?.next_num ?? 1).padStart(5, '0')}`;

    const now = new Date();
    const dueDate = data.due_date
      ? (data.due_date.includes('T') ? data.due_date.slice(0, 10) : data.due_date)
      : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString().slice(0, 10);

    const inv = await client.query(
      `INSERT INTO invoices
       (organization_id, tenant_id, employee_id, invoice_number, invoice_type, status,
        period_year, period_month, generated_date, due_date,
        base_retainer, total_expenses, grand_total,
        from_name, from_email, from_address, to_name, to_email, to_address,
        client_id, vendor_id, currency, subtotal, tax_amount, discount_amount, discount_pct,
        total_amount, amount_paid,
        payment_terms, payment_instructions, internal_notes, notes, tags, template_id)
       VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8::date,$9::date,0,0,$10,
               $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,0,
               $25,$26,$27,$28,$29,$30)
       RETURNING *`,
      [
        tenantId, tenantId, ctx.userId, invNumber, data.invoice_type ?? 'standard',
        parseInt(dueDate.slice(0, 4), 10), parseInt(dueDate.slice(5, 7), 10),
        now.toISOString().slice(0, 10), dueDate, grandTotal,
        data.from_name, data.from_email ?? null, data.from_address ?? null,
        data.to_name, data.to_email ?? null, data.to_address ?? null,
        data.client_id ?? null, data.vendor_id ?? null,
        currency, subtotal, taxTotal, discountAmt, data.discount_pct ?? null, grandTotal,
        data.payment_terms ?? 'Net 30', data.payment_instructions ?? null,
        data.internal_notes ?? null, data.notes ?? null, data.tags ?? [],
        data.template_id ?? 'default',
      ],
    );
    const invoice = inv.rows[0];

    for (let i = 0; i < data.line_items.length; i++) {
      const li = data.line_items[i]!;
      const lineTotal = li.quantity * li.unit_price;
      const lineTax = li.tax_rate ? lineTotal * li.tax_rate / 100 : 0;
      const lineTotalWithTax = lineTotal + lineTax;
      await client.query(
        `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, tax_rate, line_total, original_amount, original_currency, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [invoice.id, li.description, li.quantity, li.unit_price, li.tax_rate ?? 0, lineTotalWithTax, lineTotalWithTax, currency, i],
      );
    }

    eventBus.emit('finance.invoice.created', {
      invoiceId: invoice.id, vendorId: data.to_name ?? '', amount: grandTotal, currency,
    });

    return invoice as Invoice;
  });
}

export async function updateInvoice(
  ctx: CallerContext,
  invoiceId: string,
  data: UpdateInvoiceInput,
): Promise<Invoice> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for updateInvoice');

  return runInTenant(tenantId, async (client) => {
    const existing = await fetchInvoiceById(client, invoiceId);
    if (!existing) throw new Error('Invoice not found');
    if (existing.status !== 'draft') throw new Error('Only draft invoices can be updated');

    const fields: [string, unknown][] = [
      ['from_name', data.from_name], ['from_email', data.from_email],
      ['from_address', data.from_address], ['to_name', data.to_name],
      ['to_email', data.to_email], ['to_address', data.to_address],
      ['payment_terms', data.payment_terms], ['payment_instructions', data.payment_instructions],
      ['notes', data.notes], ['internal_notes', data.internal_notes],
      ['due_date', data.due_date], ['tags', data.tags],
    ];

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [col, val] of fields) {
      if (val !== undefined) {
        sets.push(`${col} = $${idx++}`);
        params.push(val);
      }
    }

    if (data.line_items) {
      const subtotal = data.line_items.reduce((s, li) => s + li.quantity * li.unit_price, 0);
      const taxTotal = data.line_items.reduce(
        (s, li) => s + (li.tax_rate ? li.quantity * li.unit_price * li.tax_rate / 100 : 0), 0,
      );
      const discountAmt = data.discount_amount ?? (data.discount_pct ? subtotal * data.discount_pct / 100 : 0);
      const grandTotal = subtotal + taxTotal - discountAmt;
      sets.push(`subtotal = $${idx++}`, `tax_amount = $${idx++}`, `discount_amount = $${idx++}`, `grand_total = $${idx++}`, `total_amount = $${idx++}`);
      params.push(subtotal, taxTotal, discountAmt, grandTotal, grandTotal);
    }

    sets.push(`updated_at = NOW()`);
    params.push(invoiceId);

    if (sets.length > 1) {
      await client.query(
        `UPDATE invoices SET ${sets.join(', ')} WHERE id = $${idx}`,
        params,
      );
    }

    if (data.line_items) {
      await client.query('DELETE FROM invoice_line_items WHERE invoice_id = $1', [invoiceId]);
      const currency = data.currency ?? existing.currency ?? 'USD';
      for (let i = 0; i < data.line_items.length; i++) {
        const li = data.line_items[i]!;
        const lineTotal = li.quantity * li.unit_price + (li.tax_rate ? li.quantity * li.unit_price * li.tax_rate / 100 : 0);
        await client.query(
          `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, tax_rate, line_total, original_amount, original_currency, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [invoiceId, li.description, li.quantity, li.unit_price, li.tax_rate ?? 0, lineTotal, lineTotal, currency, i],
        );
      }
    }

    const updated = await fetchInvoiceById(client, invoiceId);
    return updated!;
  });
}

export async function sendInvoice(
  ctx: CallerContext,
  invoiceId: string,
): Promise<Invoice> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for sendInvoice');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `UPDATE invoices SET status = 'sent', sent_at = NOW()
       WHERE id = $1 AND status = 'draft' RETURNING *`,
      [invoiceId],
    );
    if (!result.rows[0]) throw new Error('Invoice not found or not in draft status');

    eventBus.emit('finance.invoice.sent', { invoiceId, vendorId: result.rows[0].to_name ?? '' });

    return result.rows[0] as Invoice;
  });
}

export async function recordPayment(
  ctx: CallerContext,
  invoiceId: string,
  amount: number,
): Promise<Invoice> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for recordPayment');

  return runInTenant(tenantId, async (client) => {
    const inv = await client.query(
      'SELECT * FROM invoices WHERE id = $1',
      [invoiceId],
    );
    if (!inv.rows[0]) throw new Error('Invoice not found');

    const newPaid = parseFloat(inv.rows[0].amount_paid || '0') + amount;
    const grandTotal = parseFloat(inv.rows[0].grand_total || inv.rows[0].total_amount || '0');
    const newStatus = newPaid >= grandTotal ? 'paid' : 'partially_paid';

    await client.query(
      'UPDATE invoices SET amount_paid = $1, status = $2 WHERE id = $3',
      [newPaid, newStatus, invoiceId],
    );

    eventBus.emit('finance.invoice.paid', { invoiceId, amount, paidAt: new Date().toISOString() });

    const updated = await fetchInvoiceById(client, invoiceId);
    return updated!;
  });
}

export async function voidInvoice(
  ctx: CallerContext,
  invoiceId: string,
): Promise<Invoice> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for voidInvoice');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query(
      `UPDATE invoices SET status = 'voided' WHERE id = $1 RETURNING *`,
      [invoiceId],
    );
    if (!result.rows[0]) throw new Error('Invoice not found');

    return result.rows[0] as Invoice;
  });
}

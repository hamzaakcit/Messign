import { query, getClient } from '../../db/index.js';
import { getExchangeRate } from '../../routes/exchangeRates.js';
import { auditService } from './auditService.js';
import { notificationService } from './notificationService.js';
import { journalEntryService } from './journalEntryService.js';
import { eventBus } from '../../events/index.js';

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

export const invoiceService = {
  async create(data: CreateInvoiceInput, userId: string, orgId: string) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const subtotal = data.line_items.reduce((s, li) => s + li.quantity * li.unit_price, 0);
      const taxTotal = data.line_items.reduce(
        (s, li) => s + (li.tax_rate ? li.quantity * li.unit_price * li.tax_rate / 100 : 0), 0,
      );
      const discountAmt = data.discount_amount ?? (data.discount_pct ? subtotal * data.discount_pct / 100 : 0);
      const grandTotal = subtotal + taxTotal - discountAmt;

      const numResult = await client.query<{ next_num: string }>(
        `SELECT COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(invoice_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) + 1 as next_num FROM invoices WHERE organization_id = $1`,
        [orgId],
      );
      const invNumber = `INV-${String(numResult.rows[0]?.next_num ?? 1).padStart(5, '0')}`;

      const now = new Date();
      const dueDate = data.due_date
        ? (data.due_date.includes('T') ? data.due_date.slice(0, 10) : data.due_date)
        : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString().slice(0, 10);
      const periodYear = dueDate ? parseInt(dueDate.slice(0, 4), 10) : now.getFullYear();
      const periodMonth = dueDate ? parseInt(dueDate.slice(5, 7), 10) : now.getMonth() + 1;
      const generatedDate = now.toISOString().slice(0, 10);

      const currency = (data.currency ?? 'USD').toUpperCase().slice(0, 3);
      const rateToEur = await getExchangeRate(currency, dueDate);
      const round2 = (n: number) => Math.round(n * 100) / 100;
      const subtotalEur = round2(subtotal * rateToEur);
      const taxAmountEur = round2(taxTotal * rateToEur);
      const discountAmountEur = round2(discountAmt * rateToEur);
      const grandTotalEur = round2(grandTotal * rateToEur);

      const inv = await client.query(
        `INSERT INTO invoices
         (organization_id, tenant_id, employee_id, invoice_number, invoice_type, status,
          period_year, period_month, generated_date, due_date,
          base_retainer, total_expenses, grand_total,
          subtotal_eur, tax_amount_eur, discount_amount_eur, grand_total_eur, total_amount_eur,
          from_name, from_email, from_address, to_name, to_email, to_address,
          client_id, vendor_id, currency, subtotal, tax_amount, discount_amount, discount_pct,
          total_amount, amount_paid,
          payment_terms, payment_instructions, internal_notes, notes, tags, template_id)
         VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8::date,$9::date,0,0,$10,
                 $11,$12,$13,$14,$14,
                 $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,0,
                 $29,$30,$31,$32,$33,$34)
         RETURNING *`,
        [
          orgId, orgId, userId, invNumber, data.invoice_type ?? 'standard',
          periodYear, periodMonth, generatedDate, dueDate, grandTotal,
          subtotalEur, taxAmountEur, discountAmountEur, grandTotalEur,
          data.from_name, data.from_email ?? null, data.from_address ?? null,
          data.to_name, data.to_email ?? null, data.to_address ?? null,
          data.client_id ?? null, data.vendor_id ?? null,
          data.currency ?? 'USD', subtotal, taxTotal, discountAmt,
          data.discount_pct ?? null, grandTotal,
          data.payment_terms ?? 'Net 30', data.payment_instructions ?? null,
          data.internal_notes ?? null, data.notes ?? null, data.tags ?? [],
          data.template_id ?? 'default',
        ],
      );
      const invoice = inv.rows[0];

      for (let i = 0; i < data.line_items.length; i++) {
        const li = data.line_items[i];
        const lineTotal = li.quantity * li.unit_price;
        const lineTax = li.tax_rate ? lineTotal * li.tax_rate / 100 : 0;
        const lineTotalInCurrency = lineTotal + lineTax;
        const amountEur = Math.round(lineTotalInCurrency * rateToEur * 100) / 100;
        await client.query(
          `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, tax_rate, line_total, amount_eur, original_amount, original_currency, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [invoice.id, li.description, li.quantity, li.unit_price, li.tax_rate ?? 0, lineTotalInCurrency, amountEur, lineTotalInCurrency, currency, i],
        );
      }

      await client.query('COMMIT');

      await auditService.log({
        organization_id: orgId,
        event_type: 'invoice.created',
        event_category: 'invoice',
        actor_type: 'user',
        actor_id: userId,
        entity_type: 'invoice',
        entity_id: invoice.id,
        changes: { total: grandTotal, to: data.to_name },
      });

      eventBus.emit('finance.invoice.created', {
        invoiceId: invoice.id, vendorId: data.to_name ?? '', amount: grandTotal, currency,
      });

      return invoice;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async list(orgId: string, filters: { status?: string; limit?: number; offset?: number } = {}) {
    const conditions = ['i.organization_id = $1', "(i.is_deleted IS NULL OR i.is_deleted = FALSE)"];
    const params: unknown[] = [orgId];
    let idx = 2;

    if (filters.status) {
      conditions.push(`i.status = $${idx++}`);
      params.push(filters.status);
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const result = await query(
      `SELECT i.*, ARRAY_AGG(json_build_object(
         'id', ili.id, 'description', ili.description, 'quantity', ili.quantity,
         'unit_price', ili.unit_price, 'line_total', ili.line_total
       ) ORDER BY ili.sort_order) as line_items
       FROM invoices i
       LEFT JOIN invoice_line_items ili ON ili.invoice_id = i.id
       WHERE ${conditions.join(' AND ')}
       GROUP BY i.id
       ORDER BY i.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );
    return result.rows;
  },

  async getById(invoiceId: string, orgId: string) {
    const result = await query(
      `SELECT i.*, ARRAY_AGG(json_build_object(
         'id', ili.id, 'description', ili.description, 'quantity', ili.quantity,
         'unit_price', ili.unit_price, 'tax_rate', ili.tax_rate, 'line_total', ili.line_total
       ) ORDER BY ili.sort_order) as line_items
       FROM invoices i
       LEFT JOIN invoice_line_items ili ON ili.invoice_id = i.id
       WHERE i.id = $1 AND i.organization_id = $2
       GROUP BY i.id`,
      [invoiceId, orgId],
    );
    return result.rows[0] ?? null;
  },

  async send(invoiceId: string, userId: string, orgId: string) {
    const result = await query(
      `UPDATE invoices SET status = 'sent', sent_at = NOW() WHERE id = $1 AND organization_id = $2 AND status = 'draft' RETURNING *`,
      [invoiceId, orgId],
    );
    if (!result.rows[0]) throw new Error('Invoice not found or not in draft status');

    await auditService.log({
      organization_id: orgId,
      event_type: 'invoice.sent',
      event_category: 'invoice',
      actor_type: 'user',
      actor_id: userId,
      entity_type: 'invoice',
      entity_id: invoiceId,
    });

    eventBus.emit('finance.invoice.sent', { invoiceId, vendorId: result.rows[0].to_name ?? '' });

    journalEntryService.generateFromInvoice(invoiceId, 'sent').catch(err =>
      console.error('[journal] Failed to generate invoice sent entry:', err));

    return result.rows[0];
  },

  async recordPayment(invoiceId: string, amount: number, userId: string, orgId: string) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const inv = await client.query('SELECT * FROM invoices WHERE id = $1 AND organization_id = $2', [invoiceId, orgId]);
      if (!inv.rows[0]) throw new Error('Invoice not found');

      const newPaid = parseFloat(inv.rows[0].amount_paid || '0') + amount;
      const grandTotal = parseFloat(inv.rows[0].grand_total || inv.rows[0].total_amount || '0');
      const newStatus = newPaid >= grandTotal ? 'paid' : 'partially_paid';

      await client.query(
        'UPDATE invoices SET amount_paid = $1, status = $2 WHERE id = $3',
        [newPaid, newStatus, invoiceId],
      );

      await client.query('COMMIT');

      await auditService.log({
        organization_id: orgId,
        event_type: 'invoice.payment_recorded',
        event_category: 'invoice',
        actor_type: 'user',
        actor_id: userId,
        entity_type: 'invoice',
        entity_id: invoiceId,
        changes: { amount, new_paid: newPaid, status: newStatus },
      });

      eventBus.emit('finance.invoice.paid', { invoiceId, amount, paidAt: new Date().toISOString() });

      journalEntryService.generateFromInvoice(invoiceId, 'paid', amount).catch(err =>
        console.error('[journal] Failed to generate invoice payment entry:', err));

      return { success: true, amount_paid: newPaid, status: newStatus };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async void_(invoiceId: string, userId: string, orgId: string) {
    const result = await query(
      `UPDATE invoices SET status = 'voided' WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [invoiceId, orgId],
    );
    if (!result.rows[0]) throw new Error('Invoice not found');

    await auditService.log({
      organization_id: orgId,
      event_type: 'invoice.voided',
      event_category: 'invoice',
      actor_type: 'user',
      actor_id: userId,
      entity_type: 'invoice',
      entity_id: invoiceId,
    });

    return result.rows[0];
  },

  async update(invoiceId: string, data: Partial<CreateInvoiceInput>, userId: string, orgId: string) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const existing = await client.query(
        `SELECT * FROM invoices WHERE id = $1 AND organization_id = $2 AND (is_deleted IS NULL OR is_deleted = FALSE)`,
        [invoiceId, orgId],
      );
      if (!existing.rows[0]) throw new Error('Invoice not found');
      if (existing.rows[0].status !== 'draft') throw new Error('Only draft invoices can be edited');

      const fields: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      const setField = (col: string, val: unknown) => {
        if (val !== undefined) {
          fields.push(`${col} = $${idx++}`);
          params.push(val);
        }
      };

      setField('from_name', data.from_name);
      setField('from_email', data.from_email);
      setField('from_address', data.from_address);
      setField('to_name', data.to_name);
      setField('to_email', data.to_email);
      setField('to_address', data.to_address);
      setField('client_id', data.client_id);
      setField('vendor_id', data.vendor_id);
      setField('currency', data.currency);
      setField('payment_terms', data.payment_terms);
      setField('payment_instructions', data.payment_instructions);
      setField('notes', data.notes);
      setField('internal_notes', data.internal_notes);
      setField('tags', data.tags);
      setField('template_id', data.template_id);
      setField('discount_pct', data.discount_pct);
      setField('discount_amount', data.discount_amount);
      setField('invoice_type', data.invoice_type);

      let rateToEurForLineItems: number | undefined;
      if (data.line_items && data.line_items.length > 0) {
        const subtotal = data.line_items.reduce((s, li) => s + li.quantity * li.unit_price, 0);
        const taxTotal = data.line_items.reduce(
          (s, li) => s + (li.tax_rate ? li.quantity * li.unit_price * li.tax_rate / 100 : 0), 0,
        );
        const discountAmt = data.discount_amount ?? (data.discount_pct ? subtotal * data.discount_pct / 100 : 0);
        const grandTotal = subtotal + taxTotal - (discountAmt ?? 0);

        const existingRow = existing.rows[0] as { currency?: string; due_date?: string };
        const currency = (data.currency ?? existingRow.currency ?? 'USD').toUpperCase().slice(0, 3);
        const dueDateForRate = (data.due_date ?? existingRow.due_date)
          ? String(data.due_date ?? existingRow.due_date).slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        rateToEurForLineItems = await getExchangeRate(currency, dueDateForRate);
        const round2 = (n: number) => Math.round(n * 100) / 100;

        setField('subtotal', subtotal);
        setField('tax_amount', taxTotal);
        setField('discount_amount', discountAmt);
        setField('grand_total', grandTotal);
        setField('total_amount', grandTotal);
        setField('subtotal_eur', round2(subtotal * rateToEurForLineItems));
        setField('tax_amount_eur', round2(taxTotal * rateToEurForLineItems));
        setField('discount_amount_eur', round2((discountAmt ?? 0) * rateToEurForLineItems));
        setField('grand_total_eur', round2(grandTotal * rateToEurForLineItems));
        setField('total_amount_eur', round2(grandTotal * rateToEurForLineItems));
      }

      fields.push(`updated_at = NOW()`);

      if (fields.length > 1) {
        await client.query(
          `UPDATE invoices SET ${fields.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx++}`,
          [...params, invoiceId, orgId],
        );
      }

      if (data.line_items && data.line_items.length > 0 && rateToEurForLineItems != null) {
        const existingRow = existing.rows[0] as { currency?: string };
        const currency = (data.currency ?? existingRow.currency ?? 'USD').toUpperCase().slice(0, 3);
        await client.query('DELETE FROM invoice_line_items WHERE invoice_id = $1', [invoiceId]);
        for (let i = 0; i < data.line_items.length; i++) {
          const li = data.line_items[i];
          const lineTotal = li.quantity * li.unit_price;
          const lineTax = li.tax_rate ? lineTotal * li.tax_rate / 100 : 0;
          const lineTotalInCurrency = lineTotal + lineTax;
          await client.query(
            `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, tax_rate, line_total, amount_eur, original_amount, original_currency, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [invoiceId, li.description, li.quantity, li.unit_price, li.tax_rate ?? 0, lineTotalInCurrency, Math.round(lineTotalInCurrency * rateToEurForLineItems * 100) / 100, lineTotalInCurrency, currency, i],
          );
        }
      }

      await client.query('COMMIT');

      await auditService.log({
        organization_id: orgId,
        event_type: 'invoice.updated',
        event_category: 'invoice',
        actor_type: 'user',
        actor_id: userId,
        entity_type: 'invoice',
        entity_id: invoiceId,
        changes: data,
      });

      return this.getById(invoiceId, orgId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async softDelete(invoiceId: string, userId: string, orgId: string) {
    const existing = await query(
      `SELECT status FROM invoices WHERE id = $1 AND organization_id = $2 AND (is_deleted IS NULL OR is_deleted = FALSE)`,
      [invoiceId, orgId],
    );
    if (!existing.rows[0]) throw new Error('Invoice not found');
    if (existing.rows[0].status !== 'draft') throw new Error('Only draft invoices can be deleted');

    await query(
      `UPDATE invoices SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [invoiceId, orgId],
    );

    await auditService.log({
      organization_id: orgId,
      event_type: 'invoice.deleted',
      event_category: 'invoice',
      actor_type: 'user',
      actor_id: userId,
      entity_type: 'invoice',
      entity_id: invoiceId,
    });

    return { success: true };
  },

  async getStats(orgId: string) {
    const result = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'draft') AS draft_count,
         COUNT(*) FILTER (WHERE status = 'sent') AS sent_count,
         COUNT(*) FILTER (WHERE status = 'paid') AS paid_count,
         COUNT(*) FILTER (WHERE status = 'partially_paid') AS partial_count,
         COUNT(*) FILTER (WHERE status = 'voided') AS voided_count,
         COUNT(*) FILTER (WHERE status IN ('sent','partially_paid') AND due_date < NOW()) AS overdue_count,
         COALESCE(SUM(grand_total - amount_paid) FILTER (WHERE status IN ('sent','partially_paid')), 0) AS total_outstanding,
         COALESCE(SUM(grand_total - amount_paid) FILTER (WHERE status IN ('sent','partially_paid') AND due_date < NOW()), 0) AS total_overdue
       FROM invoices
       WHERE organization_id = $1 AND (is_deleted IS NULL OR is_deleted = FALSE)`,
      [orgId],
    );
    return result.rows[0];
  },
};

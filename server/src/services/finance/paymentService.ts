import { query, getClient } from '../../db/index.js';
import { auditService } from './auditService.js';
import { eventBus } from '../../events/index.js';

export interface CreatePaymentInput {
  payment_type: string;
  expense_id?: string;
  invoice_id?: string;
  vendor_id?: string;
  amount: number;
  currency?: string;
  recipient_id?: string;
  recipient_name?: string;
  payment_method?: string;
  payment_reference?: string;
  scheduled_date?: string;
  notes?: string;
}

export const paymentService = {
  async create(data: CreatePaymentInput, userId: string, orgId: string) {
    const numResult = await query<{ next_num: string }>(
      `SELECT COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(payment_number, '[^0-9]', '', 'g'), '') AS INTEGER)), 0) + 1 as next_num
       FROM finance_payments WHERE organization_id = $1`,
      [orgId],
    );
    const paymentNumber = `PAY-${String(numResult.rows[0]?.next_num ?? 1).padStart(5, '0')}`;

    const result = await query(
      `INSERT INTO finance_payments
       (organization_id, tenant_id, payment_number, payment_type, expense_id, invoice_id, vendor_id,
        amount, currency, recipient_id, recipient_name, payment_method, payment_reference,
        scheduled_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        orgId, orgId, paymentNumber, data.payment_type,
        data.expense_id ?? null, data.invoice_id ?? null, data.vendor_id ?? null,
        data.amount, data.currency ?? 'USD',
        data.recipient_id ?? null, data.recipient_name ?? null,
        data.payment_method ?? null, data.payment_reference ?? null,
        data.scheduled_date ?? null, data.notes ?? null, userId,
      ],
    );

    await auditService.log({
      organization_id: orgId,
      event_type: 'payment.created',
      event_category: 'payment',
      actor_type: 'user',
      actor_id: userId,
      entity_type: 'payment',
      entity_id: result.rows[0].id,
      changes: { amount: data.amount, type: data.payment_type },
    });

    return result.rows[0];
  },

  async list(orgId: string, filters: { status?: string; limit?: number; offset?: number } = {}) {
    const conditions = ['p.organization_id = $1'];
    const params: unknown[] = [orgId];
    let idx = 2;

    if (filters.status) {
      conditions.push(`p.status = $${idx++}`);
      params.push(filters.status);
    }

    const result = await query(
      `SELECT p.*, u.full_name as created_by_name
       FROM finance_payments p
       LEFT JOIN reimbursement_users u ON u.id = p.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, filters.limit ?? 50, filters.offset ?? 0],
    );
    return result.rows;
  },

  async process(paymentId: string, userId: string, orgId: string) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const pay = await client.query(
        `UPDATE finance_payments SET status = 'processing', processed_at = NOW()
         WHERE id = $1 AND organization_id = $2 AND status = 'pending' RETURNING *`,
        [paymentId, orgId],
      );
      if (!pay.rows[0]) throw new Error('Payment not found or not pending');

      await client.query('COMMIT');
      return pay.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async complete(paymentId: string, userId: string, orgId: string) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const pay = await client.query(
        `UPDATE finance_payments SET status = 'completed', completed_at = NOW()
         WHERE id = $1 AND organization_id = $2 AND status IN ('pending', 'processing') RETURNING *`,
        [paymentId, orgId],
      );
      if (!pay.rows[0]) throw new Error('Payment not found');

      if (pay.rows[0].expense_id) {
        await client.query(
          `UPDATE reimbursement_requests SET status = 'paid', paid_at = NOW() WHERE id = $1`,
          [pay.rows[0].expense_id],
        );
      }

      await client.query('COMMIT');

      await auditService.log({
        organization_id: orgId,
        event_type: 'payment.completed',
        event_category: 'payment',
        actor_type: 'user',
        actor_id: userId,
        entity_type: 'payment',
        entity_id: paymentId,
        changes: { amount: pay.rows[0].amount },
      });

      eventBus.emit('finance.payment.completed', {
        paymentId, amount: pay.rows[0].amount, vendorId: pay.rows[0].vendor_id ?? '',
      });

      return pay.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
};

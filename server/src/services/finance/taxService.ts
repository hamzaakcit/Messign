import { query } from '../../db/index.js';

export const taxService = {
  async list(orgId: string) {
    const result = await query(
      `SELECT * FROM finance_tax_rates
       WHERE organization_id = $1
       ORDER BY type, name`,
      [orgId],
    );
    return result.rows;
  },

  async create(orgId: string, data: {
    name: string;
    code: string;
    rate: number;
    type: string;
    is_default?: boolean;
    effective_from?: string;
    effective_until?: string;
  }) {
    if (data.is_default) {
      await query(
        `UPDATE finance_tax_rates SET is_default = FALSE WHERE organization_id = $1 AND type = $2`,
        [orgId, data.type],
      );
    }

    const result = await query(
      `INSERT INTO finance_tax_rates (organization_id, name, code, rate, type, is_default, effective_from, effective_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [orgId, data.name, data.code, data.rate, data.type,
       data.is_default ?? false, data.effective_from || null, data.effective_until || null],
    );
    return result.rows[0];
  },

  async update(orgId: string, id: string, data: {
    name?: string;
    rate?: number;
    is_default?: boolean;
    effective_from?: string | null;
    effective_until?: string | null;
    is_active?: boolean;
  }) {
    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name); }
    if (data.rate !== undefined) { fields.push(`rate = $${idx++}`); params.push(data.rate); }
    if (data.is_default !== undefined) { fields.push(`is_default = $${idx++}`); params.push(data.is_default); }
    if (data.effective_from !== undefined) { fields.push(`effective_from = $${idx++}`); params.push(data.effective_from); }
    if (data.effective_until !== undefined) { fields.push(`effective_until = $${idx++}`); params.push(data.effective_until); }
    if (data.is_active !== undefined) { fields.push(`is_active = $${idx++}`); params.push(data.is_active); }

    fields.push(`updated_at = NOW()`);

    const result = await query(
      `UPDATE finance_tax_rates SET ${fields.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx++} RETURNING *`,
      [...params, id, orgId],
    );
    if (!result.rows[0]) throw new Error('Tax rate not found');
    return result.rows[0];
  },

  async deactivate(orgId: string, id: string) {
    const result = await query(
      `UPDATE finance_tax_rates SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, orgId],
    );
    if (!result.rows[0]) throw new Error('Tax rate not found');
    return result.rows[0];
  },
};

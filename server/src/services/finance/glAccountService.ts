import { query } from '../../db/index.js';

export interface GLAccount {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'expense' | 'revenue' | 'equity';
  normal_balance: 'debit' | 'credit';
  parent_id: string | null;
  is_active: boolean;
  description: string | null;
  balance: number;
  created_at: string;
  updated_at: string;
  children?: GLAccount[];
}

export const glAccountService = {
  async list(orgId: string) {
    const result = await query<GLAccount>(
      `SELECT g.*,
         COALESCE(
           (SELECT SUM(jl.debit_amount) - SUM(jl.credit_amount)
            FROM finance_journal_lines jl
            JOIN finance_journal_entries je ON je.id = jl.journal_entry_id
            WHERE jl.gl_account_id = g.id AND je.status = 'posted'), 0
         ) AS computed_balance
       FROM finance_gl_accounts g
       WHERE g.organization_id = $1
       ORDER BY g.code`,
      [orgId],
    );
    return result.rows.map(r => ({ ...r, balance: parseFloat(String(r.balance)) || 0 }));
  },

  async getById(orgId: string, id: string) {
    const result = await query(
      `SELECT g.*,
         COALESCE(
           (SELECT SUM(jl.debit_amount) - SUM(jl.credit_amount)
            FROM finance_journal_lines jl
            JOIN finance_journal_entries je ON je.id = jl.journal_entry_id
            WHERE jl.gl_account_id = g.id AND je.status = 'posted'), 0
         ) AS computed_balance
       FROM finance_gl_accounts g
       WHERE g.id = $1 AND g.organization_id = $2`,
      [id, orgId],
    );
    if (!result.rows[0]) return null;

    const lines = await query(
      `SELECT jl.*, je.entry_number, je.entry_date, je.description AS entry_description
       FROM finance_journal_lines jl
       JOIN finance_journal_entries je ON je.id = jl.journal_entry_id
       WHERE jl.gl_account_id = $1 AND je.status = 'posted'
       ORDER BY je.entry_date DESC, je.created_at DESC
       LIMIT 50`,
      [id],
    );

    return { ...result.rows[0], recent_lines: lines.rows };
  },

  async create(orgId: string, data: { code: string; name: string; type: string; parent_id?: string; description?: string; normal_balance?: string }) {
    const normalBalance = data.normal_balance ||
      (['asset', 'expense'].includes(data.type) ? 'debit' : 'credit');

    const result = await query(
      `INSERT INTO finance_gl_accounts (organization_id, tenant_id, code, name, type, parent_id, description, normal_balance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [orgId, orgId, data.code, data.name, data.type, data.parent_id || null, data.description || null, normalBalance],
    );
    return result.rows[0];
  },

  async update(orgId: string, id: string, data: { name?: string; description?: string; type?: string; parent_id?: string | null; is_active?: boolean }) {
    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined) { fields.push(`name = $${idx++}`); params.push(data.name); }
    if (data.description !== undefined) { fields.push(`description = $${idx++}`); params.push(data.description); }
    if (data.parent_id !== undefined) { fields.push(`parent_id = $${idx++}`); params.push(data.parent_id); }
    if (data.is_active !== undefined) { fields.push(`is_active = $${idx++}`); params.push(data.is_active); }
    if (data.type !== undefined) {
      const hasLines = await query(
        `SELECT 1 FROM finance_journal_lines jl
         JOIN finance_journal_entries je ON je.id = jl.journal_entry_id
         WHERE jl.gl_account_id = $1 LIMIT 1`,
        [id],
      );
      if (hasLines.rows.length > 0) throw new Error('Cannot change type of account with journal lines');
      fields.push(`type = $${idx++}`); params.push(data.type);
      const nb = ['asset', 'expense'].includes(data.type) ? 'debit' : 'credit';
      fields.push(`normal_balance = $${idx++}`); params.push(nb);
    }

    fields.push(`updated_at = NOW()`);
    if (fields.length < 2) throw new Error('No fields to update');

    const result = await query(
      `UPDATE finance_gl_accounts SET ${fields.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx++} RETURNING *`,
      [...params, id, orgId],
    );
    if (!result.rows[0]) throw new Error('Account not found');
    return result.rows[0];
  },

  async deactivate(orgId: string, id: string) {
    const unposted = await query(
      `SELECT 1 FROM finance_journal_lines jl
       JOIN finance_journal_entries je ON je.id = jl.journal_entry_id
       WHERE jl.gl_account_id = $1 AND je.status = 'draft' LIMIT 1`,
      [id],
    );
    if (unposted.rows.length > 0) throw new Error('Cannot deactivate account with unposted journal entries');

    const result = await query(
      `UPDATE finance_gl_accounts SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [id, orgId],
    );
    if (!result.rows[0]) throw new Error('Account not found');
    return result.rows[0];
  },

  async getTree(orgId: string) {
    const all = await this.list(orgId);
    const map = new Map<string, GLAccount & { children: GLAccount[] }>();
    const roots: GLAccount[] = [];

    for (const a of all) {
      map.set(a.id, { ...a, children: [] });
    }
    for (const a of all) {
      const node = map.get(a.id)!;
      if (a.parent_id && map.has(a.parent_id)) {
        map.get(a.parent_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  },

  async getTrialBalance(orgId: string, period?: string) {
    let periodFilter = '';
    const params: unknown[] = [orgId];
    if (period) {
      periodFilter = ' AND je.period = $2';
      params.push(period);
    }

    const result = await query(
      `SELECT g.id, g.code, g.name, g.type, g.normal_balance,
         COALESCE(SUM(jl.debit_amount), 0) AS total_debit,
         COALESCE(SUM(jl.credit_amount), 0) AS total_credit
       FROM finance_gl_accounts g
       LEFT JOIN finance_journal_lines jl ON jl.gl_account_id = g.id
       LEFT JOIN finance_journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'${periodFilter}
       WHERE g.organization_id = $1 AND g.is_active = TRUE
       GROUP BY g.id, g.code, g.name, g.type, g.normal_balance
       ORDER BY g.code`,
      params,
    );

    let totalDebit = 0;
    let totalCredit = 0;
    const accounts = result.rows.map(r => {
      const d = parseFloat(r.total_debit);
      const c = parseFloat(r.total_credit);
      totalDebit += d;
      totalCredit += c;
      return { ...r, total_debit: d, total_credit: c, net: d - c };
    });

    return { accounts, totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 };
  },
};

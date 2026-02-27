import { query } from '../../db/index.js';

export const accountingReportService = {
  async getProfitLoss(orgId: string, periodFrom: string, periodTo: string) {
    const result = await query(
      `SELECT g.code, g.name, g.type,
         COALESCE(SUM(jl.debit_amount), 0) AS total_debit,
         COALESCE(SUM(jl.credit_amount), 0) AS total_credit
       FROM finance_gl_accounts g
       JOIN finance_journal_lines jl ON jl.gl_account_id = g.id
       JOIN finance_journal_entries je ON je.id = jl.journal_entry_id
       WHERE g.organization_id = $1
         AND je.status = 'posted'
         AND je.period >= $2 AND je.period <= $3
         AND g.type IN ('revenue', 'expense')
       GROUP BY g.id, g.code, g.name, g.type
       ORDER BY g.type DESC, g.code`,
      [orgId, periodFrom, periodTo],
    );

    const revenue: Array<{ code: string; name: string; amount: number }> = [];
    const expenses: Array<{ code: string; name: string; amount: number }> = [];

    for (const row of result.rows) {
      const amount = row.type === 'revenue'
        ? parseFloat(row.total_credit) - parseFloat(row.total_debit)
        : parseFloat(row.total_debit) - parseFloat(row.total_credit);

      if (Math.abs(amount) < 0.01) continue;
      if (row.type === 'revenue') {
        revenue.push({ code: row.code, name: row.name, amount });
      } else {
        expenses.push({ code: row.code, name: row.name, amount });
      }
    }

    const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = expenses.reduce((s, r) => s + r.amount, 0);

    // Previous period comparison
    const monthsInRange = periodDiff(periodFrom, periodTo);
    const prevTo = prevPeriod(periodFrom);
    const prevFrom = shiftPeriod(prevTo, -(monthsInRange - 1));

    const prevResult = await query(
      `SELECT g.type,
         COALESCE(SUM(CASE WHEN g.type = 'revenue' THEN jl.credit_amount - jl.debit_amount
                            ELSE jl.debit_amount - jl.credit_amount END), 0) AS amount
       FROM finance_gl_accounts g
       JOIN finance_journal_lines jl ON jl.gl_account_id = g.id
       JOIN finance_journal_entries je ON je.id = jl.journal_entry_id
       WHERE g.organization_id = $1 AND je.status = 'posted'
         AND je.period >= $2 AND je.period <= $3
         AND g.type IN ('revenue', 'expense')
       GROUP BY g.type`,
      [orgId, prevFrom, prevTo],
    );

    let prevRevenue = 0, prevExpenses = 0;
    for (const r of prevResult.rows) {
      if (r.type === 'revenue') prevRevenue = parseFloat(r.amount);
      else prevExpenses = parseFloat(r.amount);
    }

    return {
      revenue,
      expenses,
      totalRevenue,
      totalExpenses,
      netIncome: totalRevenue - totalExpenses,
      previousPeriod: {
        totalRevenue: prevRevenue,
        totalExpenses: prevExpenses,
        netIncome: prevRevenue - prevExpenses,
      },
      periodFrom,
      periodTo,
    };
  },

  async getAPAging(orgId: string) {
    const result = await query(
      `SELECT
         i.id, i.invoice_number, i.to_name, i.vendor_id,
         COALESCE(v.name, i.from_name, 'Unknown Vendor') AS vendor_name,
         i.grand_total, i.amount_paid, i.due_date, i.status,
         (i.grand_total - COALESCE(i.amount_paid, 0)) AS outstanding,
         CASE
           WHEN i.due_date >= CURRENT_DATE THEN 'current'
           WHEN CURRENT_DATE - i.due_date BETWEEN 1 AND 30 THEN 'days_1_30'
           WHEN CURRENT_DATE - i.due_date BETWEEN 31 AND 60 THEN 'days_31_60'
           WHEN CURRENT_DATE - i.due_date BETWEEN 61 AND 90 THEN 'days_61_90'
           ELSE 'days_90_plus'
         END AS aging_bucket
       FROM invoices i
       LEFT JOIN finance_vendors v ON v.id = i.vendor_id
       WHERE i.organization_id = $1
         AND i.vendor_id IS NOT NULL
         AND i.status IN ('sent', 'partially_paid', 'overdue')
         AND (i.is_deleted IS NULL OR i.is_deleted = FALSE)
       ORDER BY i.due_date`,
      [orgId],
    );

    return bucketAgingResults(result.rows, 'vendor_name');
  },

  async getARAging(orgId: string) {
    const result = await query(
      `SELECT
         i.id, i.invoice_number,
         COALESCE(i.to_name, 'Unknown Client') AS client_name,
         i.grand_total, i.amount_paid, i.due_date, i.status,
         (i.grand_total - COALESCE(i.amount_paid, 0)) AS outstanding,
         CASE
           WHEN i.due_date >= CURRENT_DATE THEN 'current'
           WHEN CURRENT_DATE - i.due_date BETWEEN 1 AND 30 THEN 'days_1_30'
           WHEN CURRENT_DATE - i.due_date BETWEEN 31 AND 60 THEN 'days_31_60'
           WHEN CURRENT_DATE - i.due_date BETWEEN 61 AND 90 THEN 'days_61_90'
           ELSE 'days_90_plus'
         END AS aging_bucket
       FROM invoices i
       WHERE i.organization_id = $1
         AND (i.vendor_id IS NULL OR i.client_id IS NOT NULL)
         AND i.status IN ('sent', 'partially_paid', 'overdue')
         AND (i.is_deleted IS NULL OR i.is_deleted = FALSE)
       ORDER BY i.due_date`,
      [orgId],
    );

    return bucketAgingResults(result.rows, 'client_name');
  },

  async getBalanceSheet(orgId: string, asOfDate?: string) {
    const dateFilter = asOfDate
      ? `AND je.created_at <= ($2::date + INTERVAL '1 day')`
      : '';
    const params: unknown[] = [orgId];
    if (asOfDate) params.push(asOfDate);

    const result = await query(
      `SELECT g.id, g.code, g.name, g.type, g.parent_id,
         COALESCE(SUM(jl.debit_amount), 0) AS total_debit,
         COALESCE(SUM(jl.credit_amount), 0) AS total_credit
       FROM finance_gl_accounts g
       LEFT JOIN finance_journal_lines jl ON jl.gl_account_id = g.id
       LEFT JOIN finance_journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted' ${dateFilter}
       WHERE g.organization_id = $1
         AND g.type IN ('asset', 'liability', 'equity')
         AND g.is_active = TRUE
       GROUP BY g.id, g.code, g.name, g.type, g.parent_id
       ORDER BY g.type, g.code`,
      params,
    );

    const assets: Array<{ code: string; name: string; balance: number }> = [];
    const liabilities: Array<{ code: string; name: string; balance: number }> = [];
    const equity: Array<{ code: string; name: string; balance: number }> = [];

    for (const row of result.rows) {
      const debit = parseFloat(row.total_debit);
      const credit = parseFloat(row.total_credit);
      const balance = row.type === 'asset'
        ? debit - credit
        : credit - debit;

      if (Math.abs(balance) < 0.01) continue;

      const entry = { code: row.code, name: row.name, balance };
      if (row.type === 'asset') assets.push(entry);
      else if (row.type === 'liability') liabilities.push(entry);
      else equity.push(entry);
    }

    const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + l.balance, 0);
    const totalEquity = equity.reduce((s, e) => s + e.balance, 0);

    return {
      assets,
      liabilities,
      equity,
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
      asOfDate: asOfDate || new Date().toISOString().split('T')[0],
    };
  },

  async getTaxSummary(orgId: string, periodFrom: string, periodTo: string) {
    const inputTax = await query(
      `SELECT
         COALESCE(SUM(tax_amount), 0) AS total,
         COUNT(*) AS count
       FROM reimbursement_requests
       WHERE organization_id = $1
         AND tax_amount > 0
         AND status IN ('approved', 'paid', 'reimbursed', 'ai_approved', 'manager_approved', 'finance_approved')
         AND created_at >= ($2 || '-01')::DATE
         AND created_at < (($3 || '-01')::DATE + INTERVAL '1 month')`,
      [orgId, periodFrom, periodTo],
    );

    const outputTax = await query(
      `SELECT
         COALESCE(SUM(tax_amount), 0) AS total,
         COUNT(*) AS count
       FROM invoices
       WHERE organization_id = $1
         AND tax_amount > 0
         AND status IN ('sent', 'paid', 'partially_paid')
         AND (is_deleted IS NULL OR is_deleted = FALSE)
         AND created_at >= ($2 || '-01')::DATE
         AND created_at < (($3 || '-01')::DATE + INTERVAL '1 month')`,
      [orgId, periodFrom, periodTo],
    );

    const taxRates = await query(
      `SELECT * FROM finance_tax_rates WHERE organization_id = $1 AND is_active = TRUE ORDER BY type, name`,
      [orgId],
    );

    const inputTotal = parseFloat(inputTax.rows[0]?.total || '0');
    const outputTotal = parseFloat(outputTax.rows[0]?.total || '0');

    return {
      inputTax: { total: inputTotal, count: parseInt(inputTax.rows[0]?.count || '0') },
      outputTax: { total: outputTotal, count: parseInt(outputTax.rows[0]?.count || '0') },
      netTaxPosition: outputTotal - inputTotal,
      taxRates: taxRates.rows,
      periodFrom,
      periodTo,
    };
  },
};

function bucketAgingResults(rows: any[], groupByField: string) {
  const grouped = new Map<string, {
    name: string;
    current: number; days_1_30: number; days_31_60: number; days_61_90: number; days_90_plus: number;
    total: number;
    invoices: any[];
  }>();

  const totals = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, grandTotal: 0 };

  for (const row of rows) {
    const name = row[groupByField];
    const outstanding = parseFloat(row.outstanding);
    if (!grouped.has(name)) {
      grouped.set(name, { name, current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total: 0, invoices: [] });
    }
    const group = grouped.get(name)!;
    const bucket = row.aging_bucket as keyof typeof totals;

    if (bucket in group) {
      (group as any)[bucket] += outstanding;
    }
    group.total += outstanding;
    group.invoices.push({
      id: row.id,
      invoice_number: row.invoice_number,
      grand_total: parseFloat(row.grand_total),
      amount_paid: parseFloat(row.amount_paid || '0'),
      outstanding,
      due_date: row.due_date,
      status: row.status,
      aging_bucket: row.aging_bucket,
    });

    if (bucket in totals) {
      (totals as any)[bucket] += outstanding;
    }
    totals.grandTotal += outstanding;
  }

  return {
    buckets: Array.from(grouped.values()),
    totals,
  };
}

function periodDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

function prevPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

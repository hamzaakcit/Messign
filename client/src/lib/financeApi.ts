import { getAccessToken } from './authToken';
import { API_ORIGIN } from './api';

const FINANCE_BASE = `${API_ORIGIN}/api/finance`;

async function financeRequest<T>(
  path: string,
  options: RequestInit = {},
  userId?: string,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;

  const res = await fetch(`${FINANCE_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// ── Types ──────────────────────────────────────────

export interface Expense {
  id: string;
  organization_id: string;
  submitted_by: string;
  submitter_name?: string;
  submitter_email?: string;
  title: string;
  description?: string;
  category_id?: string;
  category_slug?: string;
  category_name?: string;
  category_icon?: string;
  original_amount: number;
  original_currency: string;
  expense_date: string;
  status: string;
  tax_amount?: number;
  tip_amount?: number;
  ai_confidence_score?: number;
  ai_risk_score?: number;
  ai_risk_flags?: Array<{ type: string; severity: string; description: string }>;
  ai_review_notes?: string;
  ai_auto_approved?: boolean;
  ai_category_suggestion?: string;
  ai_policy_result?: unknown;
  ai_duplicate_refs?: unknown;
  receipt_url?: string;
  receipt_verified?: boolean;
  budget_id?: string;
  vendor_id?: string;
  team_id?: string;
  tags?: string[];
  notes?: string;
  rejection_reason?: string;
  submitted_at?: string;
  approved_at?: string;
  paid_at?: string;
  created_at: string;
  updated_at: string;
  receipts?: ReceiptDoc[];
  line_items?: ExpenseLineItem[];
  approval_steps?: ApprovalStep[];
  comments?: ExpenseComment[];
}

export interface ReceiptDoc {
  id: string;
  file_name: string;
  file_url: string;
  ocr_processed: boolean;
  ocr_vendor_name?: string;
  ocr_amount?: number;
  extracted_vendor?: string;
  extracted_amount?: number;
  extracted_date?: string;
}

export interface ExpenseLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  category_slug?: string;
}

export interface ApprovalStep {
  id: string;
  step_order: number;
  step_type: string;
  step_name?: string;
  assigned_to: string;
  approver_name?: string;
  status: string;
  decision_at?: string;
  decision_notes?: string;
  ai_recommendation?: string;
  ai_confidence?: number;
}

export interface ExpenseComment {
  id: string;
  user_id: string;
  author_name?: string;
  comment_text: string;
  is_internal: boolean;
  created_at: string;
}

export interface ExpenseListResult {
  expenses: Expense[];
  total: number;
  limit: number;
  offset: number;
}

export interface DashboardMetrics {
  pending_expenses: { count: number; total: number };
  under_review: { count: number; avg_days: number };
  approved_this_month: { count: number; total: number };
  total_paid_ytd: number;
  overdue_invoices: { count: number; total: number };
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  line_total: number;
  sort_order: number;
}

export interface FinanceInvoice {
  id: string;
  organization_id: string;
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
  client_id?: string;
  vendor_id?: string;
  currency: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  discount_pct?: number;
  grand_total: number;
  total_amount: number;
  amount_paid: number;
  payment_terms?: string;
  payment_method?: string;
  payment_instructions?: string;
  notes?: string;
  internal_notes?: string;
  tags?: string[];
  template_id?: string;
  is_recurring?: boolean;
  sent_at?: string;
  due_date?: string;
  created_at: string;
  updated_at: string;
  line_items: InvoiceLineItem[];
}

export interface InvoiceStats {
  draft_count: number;
  sent_count: number;
  paid_count: number;
  partial_count: number;
  voided_count: number;
  overdue_count: number;
  total_outstanding: number;
  total_overdue: number;
}

export interface FinancePayment {
  id: string;
  payment_number: string;
  payment_type: string;
  expense_id?: string;
  invoice_id?: string;
  vendor_id?: string;
  amount: number;
  currency: string;
  recipient_id?: string;
  recipient_name?: string;
  payment_method?: string;
  payment_reference?: string;
  status: string;
  scheduled_date?: string;
  processed_at?: string;
  completed_at?: string;
  notes?: string;
  created_by: string;
  created_by_name?: string;
  created_at: string;
}

export interface FinanceNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  entity_type?: string;
  entity_id?: string;
  action_url?: string;
  priority: string;
  is_read: boolean;
  created_at: string;
}

// ── Accounting Types ────────────────────────────────

export interface GLAccount {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  sub_type?: string;
  parent_id?: string;
  description?: string;
  is_active: boolean;
  current_balance: number;
  normal_balance: 'debit' | 'credit';
  children?: GLAccount[];
  created_at: string;
  computed_balance?: number;
  balance?: number;
}

export interface TrialBalance {
  accounts: Array<{
    code: string;
    name: string;
    type: string;
    debit_total: number;
    credit_total: number;
    balance: number;
  }>;
  total_debit: number;
  total_credit: number;
  balanced: boolean;
  totalDebit?: number;
  totalCredit?: number;
  isBalanced?: boolean;
}

export interface JournalEntry {
  id: string;
  organization_id: string;
  entry_number: string;
  entry_date: string;
  description: string;
  source_type?: string;
  source_id?: string;
  status: 'draft' | 'posted' | 'voided';
  total_debit: number;
  total_credit: number;
  created_by?: string;
  created_at: string;
  lines?: JournalLine[];
  is_auto_generated?: boolean;
}

export interface JournalLine {
  id: string;
  account_id: string;
  account_code?: string;
  account_name?: string;
  description?: string;
  debit_amount: number;
  credit_amount: number;
  gl_code?: string;
  gl_name?: string;
}

export interface ProfitLossReport {
  period_from: string;
  period_to: string;
  revenue: any;
  expenses: any;
  net_income: number;
  totalRevenue?: number;
  totalExpenses?: number;
  netIncome?: number;
  previousPeriod?: { totalRevenue: number; totalExpenses: number; netIncome: number };
}

export interface AgingReport {
  summary?: { current: number; days_30: number; days_60: number; days_90: number; over_90: number; total: number };
  details?: Array<{
    name: string;
    current: number;
    days_30: number;
    days_60: number;
    days_90: number;
    over_90: number;
    total: number;
  }>;
  totals?: any;
  buckets?: any;
}

export interface TaxSummary {
  period_from: string;
  period_to: string;
  collected: Array<{ tax_code: string; tax_name: string; taxable_amount: number; tax_amount: number }>;
  paid: Array<{ tax_code: string; tax_name: string; taxable_amount: number; tax_amount: number }>;
  total_collected: number;
  total_paid: number;
  net_liability: number;
}

export interface TaxRate {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  rate: number;
  type: 'vat' | 'sales' | 'purchase' | 'withholding';
  is_active: boolean;
  created_at: string;
}

export interface PeriodClose {
  id: string;
  organization_id: string;
  period: string;
  status: 'open' | 'in_progress' | 'closed' | 'locked';
  tasks: PeriodCloseTask[];
  closed_at?: string;
  closed_by?: string;
  locked_at?: string;
  created_at: string;
  label?: string;
  revenue_total?: number;
  expense_total?: number;
  net_income?: number;
}

export interface PeriodCloseTask {
  id: string;
  period_close_id: string;
  task_key: string;
  task_name: string;
  completed: boolean;
  completed_at?: string;
  completed_by?: string;
  is_completed?: boolean;
  label?: string;
}

// ── API Client ─────────────────────────────────────

export const financeAPI = {
  getDashboard: (userId: string) =>
    financeRequest<DashboardMetrics>('/dashboard', {}, userId),

  listExpenses: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return financeRequest<ExpenseListResult>(`/expenses?${params}`, {}, userId);
  },

  getExpense: (userId: string, expenseId: string) =>
    financeRequest<Expense>(`/expenses/${expenseId}`, {}, userId),

  createExpense: (userId: string, data: Record<string, unknown>) =>
    financeRequest<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) }, userId),

  updateExpense: (userId: string, expenseId: string, data: Record<string, unknown>) =>
    financeRequest<Expense>(`/expenses/${expenseId}`, { method: 'PUT', body: JSON.stringify(data) }, userId),

  deleteExpense: (userId: string, expenseId: string) =>
    financeRequest<{ success: boolean }>(`/expenses/${expenseId}`, { method: 'DELETE' }, userId),

  submitExpense: (userId: string, expenseId: string) =>
    financeRequest<{ success: boolean }>(`/expenses/${expenseId}/submit`, { method: 'POST' }, userId),

  approveExpense: (userId: string, expenseId: string, comments?: string) =>
    financeRequest<{ success: boolean }>(`/expenses/${expenseId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comments }),
    }, userId),

  rejectExpense: (userId: string, expenseId: string, reason: string) =>
    financeRequest<{ success: boolean }>(`/expenses/${expenseId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }, userId),

  bulkApprove: (userId: string, expenseIds: string[]) =>
    financeRequest<{ results: Array<{ id: string; success: boolean; error?: string }> }>(
      '/expenses/bulk-approve',
      { method: 'POST', body: JSON.stringify({ expense_ids: expenseIds }) },
      userId,
    ),

  getNotifications: (userId: string) =>
    financeRequest<{ notifications: FinanceNotification[]; unreadCount: number }>('/notifications', {}, userId),

  markNotificationRead: (userId: string, notifId: string) =>
    financeRequest<{ success: boolean }>(`/notifications/${notifId}/read`, { method: 'PUT' }, userId),

  markAllNotificationsRead: (userId: string) =>
    financeRequest<{ success: boolean }>('/notifications/read-all', { method: 'PUT' }, userId),

  getAuditLog: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return financeRequest<{ entries: AuditEntry[]; total: number }>(`/audit-log?${params}`, {}, userId);
  },

  verifyAuditChain: (userId: string) =>
    financeRequest<{ valid: boolean; brokenAt?: number }>('/audit-log/verify-chain', {}, userId),

  getSLAStatus: (userId: string, expenseId: string) =>
    financeRequest<SLAStatus | null>(`/sla/status/${expenseId}`, {}, userId),

  getSLAMetrics: (userId: string) =>
    financeRequest<SLAMetrics>('/sla/metrics', {}, userId),

  getOverdueSLAs: (userId: string) =>
    financeRequest<SLAStatus[]>('/sla/overdue', {}, userId),

  getDoraInsights: (userId: string) =>
    financeRequest<{ insights: DoraInsightData[] }>('/dora/insights', {}, userId),

  getNotificationPreferences: (userId: string) =>
    financeRequest<Record<string, { in_app: boolean; email: boolean }>>('/notification-preferences', {}, userId),

  updateNotificationPreferences: (userId: string, prefs: Record<string, { in_app: boolean; email: boolean }>) =>
    financeRequest<Record<string, { in_app: boolean; email: boolean }>>('/notification-preferences', {
      method: 'PUT', body: JSON.stringify(prefs),
    }, userId),

  getApprovalWorkflows: (userId: string) =>
    financeRequest<ApprovalWorkflowStep[]>('/settings/approval-workflows', {}, userId),

  updateApprovalWorkflows: (userId: string, workflows: ApprovalWorkflowStep[]) =>
    financeRequest<ApprovalWorkflowStep[]>('/settings/approval-workflows', {
      method: 'PUT', body: JSON.stringify({ workflows }),
    }, userId),

  bulkDeactivateVendors: (userId: string, vendorIds: string[]) =>
    financeRequest<{ results: Array<{ id: string; success: boolean; error?: string }> }>(
      '/vendors/bulk-deactivate', { method: 'POST', body: JSON.stringify({ vendor_ids: vendorIds }) }, userId),

  bulkCompletePayments: (userId: string, paymentIds: string[]) =>
    financeRequest<{ results: Array<{ id: string; success: boolean; error?: string }> }>(
      '/payments/bulk-complete', { method: 'POST', body: JSON.stringify({ payment_ids: paymentIds }) }, userId),

  // ── Invoices ─────────────────────────────
  listInvoices: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return financeRequest<FinanceInvoice[]>(`/invoices?${params}`, {}, userId);
  },
  getInvoice: (userId: string, invoiceId: string) =>
    financeRequest<FinanceInvoice>(`/invoices/${invoiceId}`, {}, userId),
  createInvoice: (userId: string, data: Record<string, unknown>) =>
    financeRequest<FinanceInvoice>('/invoices', { method: 'POST', body: JSON.stringify(data) }, userId),
  updateInvoice: (userId: string, invoiceId: string, data: Record<string, unknown>) =>
    financeRequest<FinanceInvoice>(`/invoices/${invoiceId}`, { method: 'PUT', body: JSON.stringify(data) }, userId),
  deleteInvoice: (userId: string, invoiceId: string) =>
    financeRequest<{ success: boolean }>(`/invoices/${invoiceId}`, { method: 'DELETE' }, userId),
  sendInvoice: (userId: string, invoiceId: string) =>
    financeRequest<FinanceInvoice>(`/invoices/${invoiceId}/send`, { method: 'POST' }, userId),
  recordInvoicePayment: (userId: string, invoiceId: string, amount: number) =>
    financeRequest<{ success: boolean; amount_paid: number; status: string }>(
      `/invoices/${invoiceId}/payment`, { method: 'POST', body: JSON.stringify({ amount }) }, userId),
  voidInvoice: (userId: string, invoiceId: string) =>
    financeRequest<FinanceInvoice>(`/invoices/${invoiceId}/void`, { method: 'POST' }, userId),
  getInvoiceStats: (userId: string) =>
    financeRequest<InvoiceStats>('/invoices-stats', {}, userId),
  downloadInvoicePdf: async (userId: string, invoiceId: string) => {
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (userId) headers['X-User-Id'] = userId;
    const res = await fetch(`${FINANCE_BASE}/invoices/${invoiceId}/pdf`, { headers });
    if (!res.ok) throw new Error('Failed to download PDF');
    return res.blob();
  },

  scanInvoiceDocument: async (userId: string, file: File) => {
    const formData = new FormData();
    formData.append('document', file);
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (userId) headers['X-User-Id'] = userId;
    const res = await fetch(`${FINANCE_BASE}/invoices/scan`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `Scan failed: ${res.status}`);
    }
    return res.json() as Promise<{ extraction: {
      vendor_name: string | null; vendor_email: string | null; vendor_address: string | null;
      invoice_number: string | null; invoice_date: string | null; due_date: string | null;
      currency: string | null; payment_terms: string | null;
      line_items: Array<{ description: string; quantity: number; unit_price: number; tax_rate: number }>;
      subtotal: number | null; tax_total: number | null; discount_pct: number | null; grand_total: number | null;
      notes: string | null; payment_instructions: string | null;
      confidence: number; raw_extraction: Record<string, unknown>;
    } }>;
  },

  // ── Budgets (v1.2) ──────────────────────
  listBudgets: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return financeRequest<unknown[]>(`/budgets?${params}`, {}, userId);
  },
  getCategoryDepartmentMap: (userId: string) =>
    financeRequest<Record<string, string>>('/category-department-map', {}, userId),
  getBudget: (userId: string, budgetId: string) =>
    financeRequest<unknown>(`/budgets/${budgetId}`, {}, userId),
  createBudget: (userId: string, data: Record<string, unknown>) =>
    financeRequest<unknown>('/budgets', { method: 'POST', body: JSON.stringify(data) }, userId),
  updateBudget: (userId: string, budgetId: string, data: Record<string, unknown>) =>
    financeRequest<unknown>(`/budgets/${budgetId}`, { method: 'PUT', body: JSON.stringify(data) }, userId),
  getBudgetHealth: (userId: string, budgetId: string) =>
    financeRequest<unknown>(`/budgets/${budgetId}/health`, {}, userId),

  // ── Vendors ──────────────────────────────
  listVendors: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return financeRequest<unknown[]>(`/vendors?${params}`, {}, userId);
  },
  getVendor: (userId: string, vendorId: string) =>
    financeRequest<unknown>(`/vendors/${vendorId}`, {}, userId),
  createVendor: (userId: string, data: Record<string, unknown>) =>
    financeRequest<unknown>('/vendors', { method: 'POST', body: JSON.stringify(data) }, userId),
  updateVendor: (userId: string, vendorId: string, data: Record<string, unknown>) =>
    financeRequest<unknown>(`/vendors/${vendorId}`, { method: 'PUT', body: JSON.stringify(data) }, userId),

  // ── Payments ─────────────────────────────
  listPayments: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return financeRequest<FinancePayment[]>(`/payments?${params}`, {}, userId);
  },
  createPayment: (userId: string, data: Record<string, unknown>) =>
    financeRequest<FinancePayment>('/payments', { method: 'POST', body: JSON.stringify(data) }, userId),
  completePayment: (userId: string, paymentId: string) =>
    financeRequest<FinancePayment>(`/payments/${paymentId}/complete`, { method: 'POST' }, userId),

  // ── Analytics ────────────────────────────
  getAnalyticsDashboard: (userId: string) =>
    financeRequest<unknown>('/analytics/dashboard', {}, userId),
  getSpendingTrend: (userId: string, months = 6) =>
    financeRequest<unknown[]>(`/analytics/spending-trend?months=${months}`, {}, userId),
  getSpendingByCategory: (userId: string) =>
    financeRequest<unknown[]>('/analytics/spending-by-category', {}, userId),
  getAIMetrics: (userId: string) =>
    financeRequest<unknown>('/analytics/ai-metrics', {}, userId),

  // ── Approvals ────────────────────────────
  getApprovalChain: (userId: string, entityType: string, entityId: string) =>
    financeRequest<unknown[]>(`/approvals/chain/${entityType}/${entityId}`, {}, userId),
  advanceApproval: (userId: string, data: { entityType: string; entityId: string; action: string; notes?: string; submitterId?: string }) =>
    financeRequest<unknown>('/approvals/advance', { method: 'POST', body: JSON.stringify(data) }, userId),
  delegateApproval: (userId: string, stepId: string, delegateToId: string) =>
    financeRequest<unknown>('/approvals/delegate', { method: 'POST', body: JSON.stringify({ stepId, delegateToId }) }, userId),
  escalateApproval: (userId: string, stepId: string) =>
    financeRequest<unknown>('/approvals/escalate', { method: 'POST', body: JSON.stringify({ stepId }) }, userId),

  // ── Forecasts ──────────────────────────
  forecastBudgets: (userId: string) =>
    financeRequest<unknown[]>('/forecast/budgets', {}, userId),
  forecastPayments: (userId: string, months = 3) =>
    financeRequest<unknown[]>(`/forecast/payments?months=${months}`, {}, userId),

  // ── Receipt Upload + OCR ─────────────────
  uploadReceipt: async (userId: string, expenseId: string, file: File) => {
    const formData = new FormData();
    formData.append('receipt', file);
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (userId) headers['X-User-Id'] = userId;
    const res = await fetch(`${FINANCE_BASE}/expenses/${expenseId}/receipts`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `Upload failed: ${res.status}`);
    }
    return res.json() as Promise<ReceiptDoc>;
  },

  triggerOCR: (userId: string, expenseId: string, docId: string) =>
    financeRequest<{ extraction: { vendor_name: string | null; amount: number | null; currency: string | null; date: string | null; category: string | null; confidence: number }; document_id: string }>(
      `/expenses/${expenseId}/receipts/${docId}/ocr`, { method: 'POST' }, userId,
    ),

  checkDuplicate: (userId: string, amount: number, date: string) =>
    financeRequest<{ duplicates: Array<{ id: string; title: string; original_amount: number; expense_date: string; status: string }> }>(
      `/expenses/check-duplicate?amount=${amount}&date=${date}`, {}, userId,
    ),

  // ── Comments ───────────────────────────────
  addComment: (userId: string, expenseId: string, commentText: string, isInternal = false) =>
    financeRequest<ExpenseComment>(`/expenses/${expenseId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment_text: commentText, is_internal: isInternal }),
    }, userId),

  // ── Request Info ───────────────────────────
  requestInfo: (userId: string, expenseId: string, message: string) =>
    financeRequest<{ success: boolean }>(`/expenses/${expenseId}/request-info`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }, userId),

  // ── Dora Feedback ─────────────────────────
  doraFeedback: (userId: string, decisionId: string, rating: number, comment?: string) =>
    financeRequest<{ success: boolean }>(`/dora-decisions/${decisionId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    }, userId),

  submitExpenseFeedback: (userId: string, expenseId: string, rating: number, comment?: string) =>
    financeRequest<{ success: boolean }>(`/expenses/${expenseId}/dora-feedback`, {
      method: 'POST',
      body: JSON.stringify({ rating, comment }),
    }, userId),

  // ── Categories ───────────────────────────
  getCategories: (userId: string) =>
    financeRequest<unknown[]>('/categories', {}, userId),

  // ── GL Accounts ─────────────────────────
  listGLAccounts: (userId: string) =>
    financeRequest<GLAccount[]>('/gl-accounts', {}, userId),
  getGLAccountTree: (userId: string) =>
    financeRequest<GLAccount[]>('/gl-accounts/tree', {}, userId),
  getTrialBalance: (userId: string, period?: string) => {
    const params = period ? `?period=${period}` : '';
    return financeRequest<TrialBalance>(`/gl-accounts/trial-balance${params}`, {}, userId);
  },
  getGLAccount: (userId: string, id: string) =>
    financeRequest<GLAccount>(`/gl-accounts/${id}`, {}, userId),
  createGLAccount: (userId: string, data: Partial<GLAccount>) =>
    financeRequest<GLAccount>('/gl-accounts', { method: 'POST', body: JSON.stringify(data) }, userId),
  updateGLAccount: (userId: string, id: string, data: Partial<GLAccount>) =>
    financeRequest<GLAccount>(`/gl-accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }, userId),
  deactivateGLAccount: (userId: string, id: string) =>
    financeRequest<GLAccount>(`/gl-accounts/${id}`, { method: 'DELETE' }, userId),

  // ── Journal Entries ─────────────────────
  listJournalEntries: (userId: string, filters?: Record<string, string>) => {
    const params = new URLSearchParams(filters || {});
    return financeRequest<{ entries: JournalEntry[]; total: number }>(`/journal-entries?${params}`, {}, userId);
  },
  getJournalEntry: (userId: string, id: string) =>
    financeRequest<JournalEntry>(`/journal-entries/${id}`, {}, userId),
  voidJournalEntry: (userId: string, id: string) =>
    financeRequest<JournalEntry>(`/journal-entries/${id}/void`, { method: 'POST' }, userId),
  createJournalEntry: (userId: string, data: {
    description: string;
    entry_date: string;
    period?: string;
    reference?: string;
    lines: Array<{ gl_code: string; debit: number; credit: number; description?: string }>;
  }) =>
    financeRequest<JournalEntry>('/journal-entries', { method: 'POST', body: JSON.stringify(data) }, userId),

  // ── Accounting Reports ──────────────────
  getProfitLoss: (userId: string, periodFrom: string, periodTo: string) =>
    financeRequest<ProfitLossReport>(`/reports/profit-loss?period_from=${periodFrom}&period_to=${periodTo}`, {}, userId),
  getAPAging: (userId: string) =>
    financeRequest<AgingReport>('/reports/ap-aging', {}, userId),
  getARAging: (userId: string) =>
    financeRequest<AgingReport>('/reports/ar-aging', {}, userId),
  getBalanceSheet: (userId: string, asOfDate?: string) =>
    financeRequest<{
      assets: Array<{ code: string; name: string; balance: number }>;
      liabilities: Array<{ code: string; name: string; balance: number }>;
      equity: Array<{ code: string; name: string; balance: number }>;
      totalAssets: number;
      totalLiabilities: number;
      totalEquity: number;
      totalLiabilitiesAndEquity: number;
      isBalanced: boolean;
      asOfDate: string;
    }>(`/reports/balance-sheet${asOfDate ? `?as_of_date=${asOfDate}` : ''}`, {}, userId),
  getTaxSummary: (userId: string, periodFrom: string, periodTo: string) =>
    financeRequest<TaxSummary>(`/reports/tax-summary?period_from=${periodFrom}&period_to=${periodTo}`, {}, userId),

  // ── Tax Rates ───────────────────────────
  listTaxRates: (userId: string) =>
    financeRequest<TaxRate[]>('/tax-rates', {}, userId),
  createTaxRate: (userId: string, data: Partial<TaxRate>) =>
    financeRequest<TaxRate>('/tax-rates', { method: 'POST', body: JSON.stringify(data) }, userId),
  updateTaxRate: (userId: string, id: string, data: Partial<TaxRate>) =>
    financeRequest<TaxRate>(`/tax-rates/${id}`, { method: 'PUT', body: JSON.stringify(data) }, userId),
  deactivateTaxRate: (userId: string, id: string) =>
    financeRequest<TaxRate>(`/tax-rates/${id}`, { method: 'DELETE' }, userId),

  // ── Period Close ────────────────────────
  listPeriodCloses: (userId: string) =>
    financeRequest<PeriodClose[]>('/period-close', {}, userId),
  getPeriodClose: (userId: string, period: string) =>
    financeRequest<PeriodClose>(`/period-close/${period}`, {}, userId),
  updatePeriodCloseTask: (userId: string, periodCloseId: string, taskKey: string, completed: boolean) =>
    financeRequest<PeriodCloseTask>(`/period-close/${periodCloseId}/task`, {
      method: 'PUT', body: JSON.stringify({ task_key: taskKey, completed }),
    }, userId),
  closePeriod: (userId: string, periodCloseId: string) =>
    financeRequest<PeriodClose>(`/period-close/${periodCloseId}/close`, { method: 'POST' }, userId),
  lockPeriod: (userId: string, periodCloseId: string) =>
    financeRequest<PeriodClose>(`/period-close/${periodCloseId}/lock`, { method: 'POST' }, userId),
  reopenPeriod: (userId: string, periodCloseId: string) =>
    financeRequest<PeriodClose>(`/period-close/${periodCloseId}/reopen`, { method: 'POST' }, userId),

  // ── Settings ────────────────────────────
  getSettings: (userId: string) =>
    financeRequest<FinanceSettings>('/settings', {}, userId),
  updateSettings: (userId: string, data: Partial<FinanceSettings>) =>
    financeRequest<FinanceSettings>('/settings', { method: 'PUT', body: JSON.stringify(data) }, userId),

  // ── Expense Policies ────────────────────
  listExpensePolicies: (userId: string) =>
    financeRequest<ExpensePolicy[]>('/expense-policies', {}, userId),
  createExpensePolicy: (userId: string, data: Partial<ExpensePolicy>) =>
    financeRequest<ExpensePolicy>('/expense-policies', { method: 'POST', body: JSON.stringify(data) }, userId),
  updateExpensePolicy: (userId: string, id: string, data: Partial<ExpensePolicy>) =>
    financeRequest<ExpensePolicy>(`/expense-policies/${id}`, { method: 'PUT', body: JSON.stringify(data) }, userId),
  deleteExpensePolicy: (userId: string, id: string) =>
    financeRequest<{ success: boolean }>(`/expense-policies/${id}`, { method: 'DELETE' }, userId),

  // ── Recurring Invoices ──────────────────
  listRecurringInvoices: (userId: string) =>
    financeRequest<FinanceInvoice[]>('/invoices/recurring', {}, userId),
  createRecurringInvoice: (userId: string, data: Record<string, unknown>) =>
    financeRequest<FinanceInvoice>('/invoices/recurring', { method: 'POST', body: JSON.stringify(data) }, userId),
  generateNextRecurrence: (userId: string, invoiceId: string) =>
    financeRequest<FinanceInvoice>(`/invoices/recurring/${invoiceId}/generate`, { method: 'POST' }, userId),
  pauseRecurringInvoice: (userId: string, invoiceId: string) =>
    financeRequest<FinanceInvoice>(`/invoices/recurring/${invoiceId}/pause`, { method: 'PUT' }, userId),
  resumeRecurringInvoice: (userId: string, invoiceId: string) =>
    financeRequest<FinanceInvoice>(`/invoices/recurring/${invoiceId}/resume`, { method: 'PUT' }, userId),

  // ── Batch Operations ────────────────────
  bulkReject: (userId: string, expenseIds: string[], reason: string) =>
    financeRequest<{ results: Array<{ id: string; success: boolean; error?: string }> }>(
      '/expenses/bulk-reject',
      { method: 'POST', body: JSON.stringify({ expense_ids: expenseIds, reason }) },
      userId,
    ),
  bulkSendInvoices: (userId: string, invoiceIds: string[]) =>
    financeRequest<{ results: Array<{ id: string; success: boolean; error?: string }> }>(
      '/invoices/bulk-send',
      { method: 'POST', body: JSON.stringify({ invoice_ids: invoiceIds }) },
      userId,
    ),

  // ── Budget Detail ───────────────────────
  getBudgetExpenses: (userId: string, budgetId: string) =>
    financeRequest<Array<Record<string, unknown>>>(`/budgets/${budgetId}/expenses`, {}, userId),
  setBudgetAllocations: (userId: string, budgetId: string, allocations: Record<string, unknown>) =>
    financeRequest<unknown>(`/budgets/${budgetId}/allocations`, { method: 'PUT', body: JSON.stringify(allocations) }, userId),
  deleteBudget: (userId: string, budgetId: string) =>
    financeRequest<{ success: boolean }>(`/budgets/${budgetId}`, { method: 'DELETE' }, userId),
  deactivateVendor: (userId: string, vendorId: string) =>
    financeRequest<{ success: boolean }>(`/vendors/${vendorId}`, { method: 'DELETE' }, userId),
  getVendorTransactions: (userId: string, vendorId: string) =>
    financeRequest<{ invoices: FinanceInvoice[]; payments: FinancePayment[] }>(`/vendors/${vendorId}/transactions`, {}, userId),

  // ── Recent Activity ─────────────────────
  getRecentActivity: (userId: string, limit = 10) =>
    financeRequest<Array<{ type: string; id: string; title: string; amount?: number; status: string; created_at: string }>>(
      `/activity?limit=${limit}`, {}, userId),
  getPendingApprovals: (userId: string) =>
    financeRequest<Array<{ id: string; type: string; title: string; amount: number; submitted_by_name: string; created_at: string }>>(
      '/pending-approvals', {}, userId),

  getMe: (userId: string) =>
    financeRequest<{ id: string; role: string; email: string; full_name: string }>('/me', {}, userId),
};

// ── Sprint 4 Types ──────────────────────────────────

export interface FinanceSettings {
  id: string;
  organization_id: string;
  company_name?: string;
  company_address?: string;
  company_phone?: string;
  company_email?: string;
  company_website?: string;
  company_tax_id?: string;
  company_logo_url?: string;
  base_currency: string;
  fiscal_year_start: number;
  receipt_required_above: number;
  dora_autonomy_level: string;
  dora_auto_approve_enabled: boolean;
  dora_auto_approve_max: number;
  dora_min_confidence: number;
  dora_max_risk: number;
  dora_features: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface ExpensePolicy {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  applies_to_teams?: string[];
  applies_to_roles?: string[];
  rules: unknown;
  violation_action: 'flag' | 'block' | 'warn' | 'auto_reject';
  violation_message?: string;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface RecurringConfig {
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  next_date: string;
  end_date?: string;
  auto_send: boolean;
  paused?: boolean;
}

export interface AuditEntry {
  id: string;
  event_type: string;
  event_category: string;
  actor_type: string;
  actor_id: string;
  actor_name?: string;
  entity_type: string;
  entity_id: string;
  ip_address?: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  is_flagged?: boolean;
  severity?: string;
  ai_involved?: boolean;
  ai_confidence?: number;
  ai_reasoning?: string;
  event_hash?: string;
  previous_hash?: string;
  created_at: string;
}

export interface SLAStatus {
  step_id: string;
  expense_id: string;
  elapsed_hours: number;
  deadline_hours: number;
  status: 'on_track' | 'warning' | 'overdue';
  reminder_sent: boolean;
  escalated: boolean;
}

export interface SLAMetrics {
  total_steps_30d: number;
  on_time_count: number;
  overdue_count: number;
  compliance_rate: number;
  avg_resolution_hours: string;
}

export interface DoraInsightData {
  priority: number;
  type: 'info' | 'warning' | 'suggestion' | 'success';
  title: string;
  message: string;
  action_label?: string;
  action_url?: string;
}

export interface ApprovalWorkflowStep {
  name: string;
  min_amount: number;
  max_amount: number;
  steps: Array<{ role: string; sla_hours: number }>;
}

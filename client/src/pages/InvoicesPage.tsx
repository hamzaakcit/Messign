import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { invoicesAPI, signaturesAPI } from '@/lib/api';
import { onInvoiceGenerated, onInvoiceFinalized, onInvoiceRejected } from '@/lib/socket';
import { Button } from '@/components/ui';
import { SignaturePad } from '@/components/invoices/SignaturePad';
import {
  FileText, Zap, Eye, X, RotateCcw, Download, AlertTriangle,
  PenTool, Paperclip, Clock, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ────── Company constants ────── */
const COMPANY = {
  name: 'Messign Communications',
  address: 'Delaware, USA',
  regNumber: '13799611524',
  vatNumber: '030319941',
  currency: 'EUR',
};

/* ────── Helpers ────── */
const fmt = (amount: number | string, currency = 'EUR') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(Number(amount));

/* ────── Types ────── */
interface Invoice {
  id: string;
  invoice_number: string;
  employee_id: string;
  employee_name: string;
  period_year: number;
  period_month: number;
  base_retainer: string | number;
  total_expenses: string | number;
  grand_total: string | number;
  status: 'draft' | 'signed' | 'finalized' | 'revision' | 'paid';
  generated_date: string;
  due_date: string;
  pdf_url?: string;
  rejection_note?: string;
  signed_at?: string;
  signature_snapshot?: string | null;
  line_items?: LineItem[];
  expense_breakdown?: ExpenseBreakdownItem[];
  bank_details?: BankDetails | null;
  signature?: string | null;
}

interface ExpenseBreakdownItem {
  line_item: LineItem;
  expense: {
    id: string;
    title: string;
    description?: string | null;
    expense_date: string;
    original_amount: string | number;
    original_currency: string;
    converted_amount?: string | number | null;
    category_name?: string | null;
    status?: string;
    submitted_at?: string;
  } | null;
  documents: { id: string; file_name: string; file_url: string; document_type: string }[];
}

interface LineItem {
  id: string;
  description: string;
  amount_eur: string | number;
  original_amount?: string | number | null;
  original_currency?: string | null;
  expense_id?: string | null;
  sort_order: number;
}

interface BankDetails {
  bank_name?: string;
  iban?: string;
  swift_bic?: string;
  account_holder?: string;
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  signed: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  finalized: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  revision: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  paid: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const STATUS_ICON_COLOR: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
  signed: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  finalized: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  revision: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  paid: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
};

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════ */
export function InvoicesPage() {
  const { user } = useAuthStore();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
  const [genYear, setGenYear] = useState(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);

  // Signature state
  const [hasSignature, setHasSignature] = useState<boolean | null>(null);
  const [signaturePadOpen, setSignaturePadOpen] = useState(false);

  // Preview / Sign modal
  const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [signMode, setSignMode] = useState(false); // true when opened via "Review & Sign"

  /* ──────── Fetch invoices ──────── */
  const fetchInvoices = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await invoicesAPI.list(user.id);
      setInvoices(data as Invoice[]);
    } catch (e) {
      console.error('Failed to load invoices', e);
      setError('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  /* ──────── Check signature ──────── */
  const checkSignature = useCallback(async () => {
    if (!user?.id) return;
    try {
      const sig = await signaturesAPI.get(user.id, user.id);
      setHasSignature(!!sig?.signature_data);
    } catch {
      setHasSignature(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);
  useEffect(() => { checkSignature(); }, [checkSignature]);

  // Socket listeners
  useEffect(() => {
    const unsub1 = onInvoiceGenerated(() => fetchInvoices());
    const unsub2 = onInvoiceFinalized(() => fetchInvoices());
    const unsub3 = onInvoiceRejected(() => fetchInvoices());
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [fetchInvoices]);

  const periodLabel = (year: number, month: number) =>
    new Date(year, month - 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

  /* ──────── Generate my invoice ──────── */
  const generateMyInvoice = async () => {
    if (!user?.id) return;
    if (!hasSignature) {
      setSignaturePadOpen(true);
      return;
    }
    setActionLoading('generate');
    setError(null);
    try {
      await invoicesAPI.generateMine(user.id, genYear, genMonth);
      await fetchInvoices();
    } catch (e: any) {
      setError(e.message || 'Failed to generate invoice');
    } finally {
      setActionLoading(null);
    }
  };

  /* ──────── Sign invoice ──────── */
  const signInvoice = async (id: string) => {
    if (!user?.id) return;
    setActionLoading(`sign-${id}`);
    setError(null);
    try {
      await invoicesAPI.sign(user.id, id);
      await fetchInvoices();
      setPreviewInvoice(null);
      setSignMode(false);
    } catch (e: any) {
      setError(e.message || 'Failed to sign invoice');
    } finally {
      setActionLoading(null);
    }
  };

  /* ──────── Resubmit ──────── */
  const resubmitInvoice = async (id: string) => {
    if (!user?.id) return;
    setActionLoading(id);
    try {
      await invoicesAPI.resubmit(user.id, id);
      await fetchInvoices();
    } catch (e: any) {
      setError(e.message || 'Failed to resubmit');
    } finally {
      setActionLoading(null);
    }
  };

  /* ──────── Preview ──────── */
  const openPreview = async (inv: Invoice, forSign = false) => {
    if (!user?.id) return;
    setPreviewLoading(true);
    setSignMode(forSign);
    try {
      const full = await invoicesAPI.getById(user.id, inv.id) as Invoice;
      setPreviewInvoice(full);
    } catch {
      setPreviewInvoice(inv);
    } finally {
      setPreviewLoading(false);
    }
  };

  /* ──────── PDF Download ──────── */
  const downloadPdf = async (inv: Invoice) => {
    if (!user?.id) return;
    setActionLoading(`pdf-${inv.id}`);
    try {
      const blob = await invoicesAPI.downloadPdf(user.id, inv.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${inv.invoice_number}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e.message || 'PDF download failed');
    } finally {
      setActionLoading(null);
    }
  };

  if (!user?.id) return null;

  const items = previewInvoice?.line_items ?? [];
  const expenseBreakdown = previewInvoice?.expense_breakdown ?? [];
  const previewBank = previewInvoice?.bank_details;
  const uploadsOrigin = (import.meta.env.VITE_API_ORIGIN as string) || (typeof window !== 'undefined' ? window.location.origin : '');
  const getAttachmentUrl = (fileUrl: string) =>
    fileUrl.startsWith('http') ? fileUrl : `${uploadsOrigin}${fileUrl.startsWith('/') ? fileUrl : '/' + fileUrl}`;

  return (
    <div className="p-6 space-y-6">
      {/* Signature setup banner */}
      {hasSignature === false && (
        <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 flex items-center gap-4 flex-wrap">
          <PenTool className="w-6 h-6 text-purple-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-app">Set up your digital signature</p>
            <p className="text-sm text-app-muted">You need a signature on file to generate and sign invoices.</p>
          </div>
          <Button
            onClick={() => setSignaturePadOpen(true)}
            className="shrink-0 bg-purple-600 hover:bg-purple-500"
          >
            <PenTool className="w-4 h-4 mr-2" />
            Set Up Signature
          </Button>
        </div>
      )}

      {/* Header + generate */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-app">My Invoices</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={genMonth}
            onChange={(e) => setGenMonth(parseInt(e.target.value))}
            className="input-theme w-36 py-2"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i + 1}>
                {new Date(2026, i).toLocaleDateString('en-US', { month: 'long' })}
              </option>
            ))}
          </select>
          <select
            value={genYear}
            onChange={(e) => setGenYear(parseInt(e.target.value))}
            className="input-theme w-24 py-2"
          >
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
          </select>
          <Button
            onClick={generateMyInvoice}
            disabled={loading || actionLoading === 'generate'}
            className="inline-flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            {actionLoading === 'generate' ? 'Generating...' : 'Generate Invoice'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-amber-400 hover:text-amber-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Invoice list */}
      {loading ? (
        <div className="p-8 text-center text-app-muted">Loading...</div>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border border-app-border bg-dark-800 p-12 text-center text-app-muted">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No invoices yet.</p>
          <p className="text-sm mt-1">Select a billing period above and generate your first invoice.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const colors = STATUS_ICON_COLOR[inv.status] ?? STATUS_ICON_COLOR.draft;
            return (
              <div
                key={inv.id}
                className="rounded-xl border border-app-border bg-dark-800 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', colors.bg)}>
                    <FileText className={cn('w-5 h-5', colors.text)} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold font-mono text-app">{inv.invoice_number}</span>
                      <span className={cn('px-2 py-0.5 rounded text-xs font-bold uppercase border', STATUS_BADGE[inv.status] ?? STATUS_BADGE.draft)}>
                        {inv.status}
                      </span>
                    </div>
                    <p className="text-sm text-app-muted mt-0.5 truncate">
                      {periodLabel(inv.period_year, inv.period_month)} · Generated {String(inv.generated_date).slice(0, 10)}
                    </p>
                    {inv.status === 'revision' && inv.rejection_note && (
                      <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {inv.rejection_note}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-lg font-bold text-app">{fmt(inv.grand_total)}</p>
                    <p className="text-xs text-app-muted">
                      Consultation: {fmt(inv.base_retainer)} + Expenses: {fmt(inv.total_expenses)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Preview */}
                    <button
                      type="button"
                      onClick={() => openPreview(inv)}
                      disabled={previewLoading}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-app-hover text-app-muted hover:text-app transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Preview
                    </button>

                    {/* Draft -> Review & Sign */}
                    {inv.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => openPreview(inv, true)}
                        disabled={previewLoading}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors"
                      >
                        <PenTool className="w-4 h-4" />
                        Review & Sign
                      </button>
                    )}

                    {/* Signed -> awaiting review */}
                    {inv.status === 'signed' && (
                      <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                        <Clock className="w-3.5 h-3.5" />
                        Awaiting admin review
                      </span>
                    )}

                    {/* Finalized / Paid -> Download */}
                    {(inv.status === 'finalized' || inv.status === 'paid') && (
                      <button
                        type="button"
                        onClick={() => downloadPdf(inv)}
                        disabled={actionLoading === `pdf-${inv.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        PDF
                      </button>
                    )}

                    {/* Revision -> Resubmit */}
                    {inv.status === 'revision' && (
                      <button
                        type="button"
                        onClick={() => resubmitInvoice(inv.id)}
                        disabled={actionLoading === inv.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Resubmit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ════════ Invoice Preview / Sign Modal ════════ */}
      {previewInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => { setPreviewInvoice(null); setSignMode(false); }}
        >
          <div
            className="rounded-xl bg-white w-full max-w-2xl max-h-[90vh] overflow-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-lg">
                {signMode ? 'Review & Sign Invoice' : 'Invoice Preview'}
              </h3>
              <div className="flex items-center gap-2">
                {(previewInvoice.status === 'finalized' || previewInvoice.status === 'paid') && (
                  <button
                    onClick={() => downloadPdf(previewInvoice)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </button>
                )}
                <button onClick={() => { setPreviewInvoice(null); setSignMode(false); }} className="p-1 text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-8" style={{ fontFamily: "'Inter', sans-serif", color: '#1a2332' }}>
              {/* Header */}
              <div className="flex justify-between items-start mb-8">
                <div className="flex items-center gap-3">
                  <svg className="w-10 h-10 shrink-0" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="4" y="18" width="8" height="18" rx="4" fill="#00D9D5"/>
                    <rect x="16" y="12" width="8" height="24" rx="4" fill="#3B82F6"/>
                    <rect x="28" y="6" width="8" height="30" rx="4" fill="#8B5CF6"/>
                  </svg>
                  <div>
                    <div className="font-extrabold text-xl text-gray-900">Messign</div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-widest">Communications</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold text-gray-900 tracking-tight">INVOICE</div>
                  <div className="font-mono font-semibold text-blue-600">{previewInvoice.invoice_number}</div>
                </div>
              </div>

              {/* From / Bill To */}
              <div className="grid grid-cols-2 gap-8 mb-7">
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">From</div>
                  <div className="text-sm font-bold text-gray-900">{previewInvoice.employee_name}</div>
                  {previewBank && (
                    <div className="text-[11px] text-gray-400 mt-1">
                      {previewBank.bank_name && <div>{previewBank.bank_name}</div>}
                      {previewBank.iban && <div>IBAN: {previewBank.iban}</div>}
                      {previewBank.swift_bic && <div>SWIFT: {previewBank.swift_bic}</div>}
                    </div>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Bill To</div>
                  <div className="text-sm font-bold text-gray-900">{COMPANY.name}</div>
                  <div className="text-xs text-gray-500">{COMPANY.address}</div>
                  <div className="text-xs text-gray-400 mt-1">Reg: {COMPANY.regNumber} · VAT: {COMPANY.vatNumber}</div>
                </div>
              </div>

              {/* Details row */}
              <div className="grid grid-cols-3 gap-3 bg-gray-50 rounded-lg p-3 mb-7 text-xs">
                <div>
                  <div className="text-gray-400 font-semibold uppercase">Invoice Date</div>
                  <div className="font-semibold text-gray-900">{String(previewInvoice.generated_date).slice(0, 10)}</div>
                </div>
                <div>
                  <div className="text-gray-400 font-semibold uppercase">Period</div>
                  <div className="font-semibold text-gray-900">
                    {periodLabel(previewInvoice.period_year, previewInvoice.period_month)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-400 font-semibold uppercase">Currency</div>
                  <div className="font-semibold text-gray-900">EUR</div>
                </div>
              </div>

              {/* Line items */}
              <table className="w-full text-xs mb-5">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="pb-2 text-left text-gray-400 font-bold uppercase">Description</th>
                    <th className="pb-2 text-right text-gray-400 font-bold uppercase">Amount (EUR)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-2.5 text-gray-600">
                        {item.description}
                        {item.original_currency && item.original_amount && (
                          <span className="text-gray-400 ml-1">
                            (orig: {fmt(item.original_amount, item.original_currency)})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-semibold text-gray-800">{fmt(item.amount_eur)}</td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={2} className="py-4 text-center text-gray-400 italic">No line items</td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Totals */}
              <div className="border-t-2 border-gray-900 pt-3 flex justify-end">
                <div className="w-60">
                  <div className="flex justify-between py-1 text-sm text-gray-500">
                    <span>Consultation Fee</span>
                    <span className="font-semibold text-gray-800">{fmt(previewInvoice.base_retainer)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm text-gray-500">
                    <span>Expenses ({Math.max(0, items.length - 1)} items)</span>
                    <span className="font-semibold text-gray-800">{fmt(previewInvoice.total_expenses)}</span>
                  </div>
                  <div className="flex justify-between py-2.5 text-base font-extrabold border-t border-gray-200 mt-1">
                    <span>Total Due</span>
                    <span className="text-blue-700">{fmt(previewInvoice.grand_total)}</span>
                  </div>
                </div>
              </div>

              {/* Expense breakdown */}
              {expenseBreakdown.filter((eb) => eb.expense).length > 0 && (
                <div className="mt-8 border-t border-gray-200 pt-6">
                  <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Expense breakdown</h4>
                  <div className="space-y-4">
                    {expenseBreakdown.map((eb, idx) => {
                      if (!eb.expense) return null;
                      const exp = eb.expense;
                      const docs = eb.documents || [];
                      return (
                        <div
                          key={eb.line_item.id || idx}
                          className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 text-sm"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-gray-900">{exp.title}</p>
                              <p className="text-gray-500 text-xs mt-0.5">
                                {exp.category_name ?? '—'} · {String(exp.expense_date).slice(0, 10)}
                              </p>
                              {exp.description && (
                                <p className="text-gray-600 mt-2 text-xs">{exp.description}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-semibold text-gray-800">{fmt(eb.line_item.amount_eur)}</p>
                              {exp.original_currency && exp.original_currency !== 'EUR' && (
                                <p className="text-xs text-gray-500">
                                  orig. {fmt(exp.original_amount, exp.original_currency)}
                                </p>
                              )}
                            </div>
                          </div>
                          {docs.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <Paperclip className="w-3.5 h-3.5" />
                                Attachments ({docs.length})
                              </p>
                              <ul className="flex flex-wrap gap-2">
                                {docs.map((doc) => (
                                  <li key={doc.id}>
                                    <a
                                      href={getAttachmentUrl(doc.file_url)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-gray-200 text-xs text-blue-600 hover:bg-blue-50 hover:border-blue-200"
                                    >
                                      <FileText className="w-3 h-3 shrink-0" />
                                      {doc.file_name}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Existing signature (for signed/finalized/paid) */}
              {(previewInvoice.signature_snapshot || previewInvoice.signature) && !signMode && (
                <div className="mt-8 border-t border-gray-100 pt-5 flex justify-end">
                  <div className="text-center">
                    <img
                      src={previewInvoice.signature_snapshot || previewInvoice.signature || ''}
                      alt="Signature"
                      className="max-h-12 mb-1"
                    />
                    <div className="border-t border-gray-900 pt-1 text-xs font-semibold">{previewInvoice.employee_name}</div>
                    <div className="text-[10px] text-gray-400">
                      Digital Signature
                      {previewInvoice.signed_at && (
                        <span> · {new Date(previewInvoice.signed_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Sign section (only in sign mode for drafts) */}
              {signMode && previewInvoice.status === 'draft' && (
                <div className="mt-8 border-t-2 border-cyan-400 pt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <ShieldCheck className="w-5 h-5 text-cyan-500" />
                    <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Sign this invoice</h4>
                  </div>
                  <p className="text-sm text-gray-500 mb-4">
                    By signing, you confirm all details are correct and submit the invoice for admin review.
                  </p>
                  {/* Signature preview */}
                  {hasSignature && (
                    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 mb-4 text-center">
                      <p className="text-xs text-gray-400 mb-2">Your signature:</p>
                      {/* We'll show a loading placeholder if needed; the sig will show from the saved signature */}
                      <SignaturePreview userId={user.id} />
                    </div>
                  )}
                  <button
                    onClick={() => signInvoice(previewInvoice.id)}
                    disabled={actionLoading === `sign-${previewInvoice.id}`}
                    className="w-full py-3 rounded-xl text-sm font-bold bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <PenTool className="w-4 h-4" />
                    {actionLoading === `sign-${previewInvoice.id}` ? 'Signing...' : 'Sign Invoice'}
                  </button>
                </div>
              )}

              {/* Footer */}
              <div className="mt-8 pt-4 border-t border-gray-100 text-center text-[10px] text-gray-400">
                {COMPANY.name} · {COMPANY.address} · Reg: {COMPANY.regNumber} · VAT: {COMPANY.vatNumber}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Signature Pad Modal */}
      <SignaturePad
        open={signaturePadOpen}
        onClose={() => {
          setSignaturePadOpen(false);
          checkSignature();
        }}
        targetUserId={user.id}
        targetUserName={user.name || user.email || 'You'}
      />
    </div>
  );
}

/* ────── Signature Preview (fetches and shows current signature) ────── */
function SignaturePreview({ userId }: { userId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    signaturesAPI.get(userId, userId).then((data) => {
      if (data?.signature_data) setSrc(data.signature_data);
    }).catch(() => {});
  }, [userId]);

  if (!src) return <p className="text-xs text-gray-400 italic">Loading signature...</p>;
  return <img src={src} alt="Your signature" className="max-h-14 mx-auto" />;
}

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI, type FinanceInvoice } from '@/lib/financeApi';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Send, Download, Trash2, Edit3, XCircle,
  DollarSign, Loader2, FileText, CreditCard, X,
} from 'lucide-react';

interface InvoiceDetailPageProps {
  invoiceId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
}

export function InvoiceDetailPage({ invoiceId, onBack, onEdit }: InvoiceDetailPageProps) {
  const user = useAuthStore((s) => s.user);
  const userId = user?.authUserId || user?.id || '';

  const [invoice, setInvoice] = useState<FinanceInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentError, setPaymentError] = useState('');

  const fetch_ = useCallback(async () => {
    if (!userId || !invoiceId) return;
    setLoading(true);
    try {
      const data = await financeAPI.getInvoice(userId, invoiceId);
      setInvoice(data);
    } catch {
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, [userId, invoiceId]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleAction = async (action: string) => {
    if (!invoice) return;
    setActionLoading(action);
    try {
      switch (action) {
        case 'send':
          await financeAPI.sendInvoice(userId, invoice.id);
          break;
        case 'void':
          await financeAPI.voidInvoice(userId, invoice.id);
          break;
        case 'delete':
          await financeAPI.deleteInvoice(userId, invoice.id);
          onBack();
          return;
        case 'pdf': {
          const blob = await financeAPI.downloadInvoicePdf(userId, invoice.id);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${invoice.invoice_number}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
          setActionLoading('');
          return;
        }
      }
      await fetch_();
    } catch (err) {
      console.error(`Action ${action} failed:`, err);
    } finally {
      setActionLoading('');
    }
  };

  const handleRecordPayment = async () => {
    if (!invoice) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) { setPaymentError('Enter a valid amount'); return; }

    const balance = Number(invoice.grand_total) - Number(invoice.amount_paid);
    if (amount > balance) { setPaymentError(`Amount exceeds balance due (${fmt(balance, invoice.currency)})`); return; }

    setActionLoading('payment');
    setPaymentError('');
    try {
      await financeAPI.recordInvoicePayment(userId, invoice.id, amount);
      setShowPaymentModal(false);
      setPaymentAmount('');
      await fetch_();
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setActionLoading('');
    }
  };

  const fmt = (n: number | string, cur = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: 2 }).format(Number(n));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="text-center py-20">
        <FileText className="h-10 w-10 mx-auto mb-3 text-app-muted" />
        <p className="text-app-muted">Invoice not found</p>
        <button onClick={onBack} className="mt-4 text-primary-400 hover:text-primary-300 text-sm">Go back</button>
      </div>
    );
  }

  const cur = invoice.currency || 'USD';
  const grandTotal = Number(invoice.grand_total);
  const amountPaid = Number(invoice.amount_paid);
  const balanceDue = grandTotal - amountPaid;
  const isOverdue = invoice.status === 'sent' && invoice.due_date && new Date(invoice.due_date) < new Date();
  const displayStatus = isOverdue ? 'overdue' : invoice.status;

  const isDraft = invoice.status === 'draft';
  const isSent = invoice.status === 'sent';
  const isPartial = invoice.status === 'partially_paid';
  const isVoided = invoice.status === 'voided';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-app-muted hover:text-app-text transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Invoices
        </button>

        <div className="flex items-center gap-2">
          {isDraft && (
            <>
              <ActionBtn icon={Edit3} label="Edit" onClick={() => onEdit(invoice.id)} loading={actionLoading === 'edit'} />
              <ActionBtn icon={Send} label="Send" onClick={() => handleAction('send')} loading={actionLoading === 'send'} variant="primary" />
              <ActionBtn icon={Trash2} label="Delete" onClick={() => handleAction('delete')} loading={actionLoading === 'delete'} variant="danger" />
            </>
          )}
          {(isSent || isPartial || isOverdue) && (
            <>
              <ActionBtn icon={CreditCard} label="Record Payment" onClick={() => setShowPaymentModal(true)} variant="primary" />
              {isSent && <ActionBtn icon={XCircle} label="Void" onClick={() => handleAction('void')} loading={actionLoading === 'void'} variant="danger" />}
            </>
          )}
          {!isDraft && !isVoided && (
            <ActionBtn icon={Download} label="PDF" onClick={() => handleAction('pdf')} loading={actionLoading === 'pdf'} />
          )}
        </div>
      </div>

      {/* Invoice Header Card */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-app-text">{invoice.invoice_number}</h2>
            <p className="text-app-muted text-sm mt-1">{invoice.invoice_type === 'standard' ? 'Standard Invoice' : invoice.invoice_type}</p>
          </div>
          <StatusBadge status={displayStatus} className="text-sm px-3 py-1" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs text-app-muted uppercase tracking-wide mb-1">From</p>
            <p className="font-semibold text-app-text">{invoice.from_name}</p>
            {invoice.from_email && <p className="text-sm text-app-muted">{invoice.from_email}</p>}
            {invoice.from_address && <p className="text-sm text-app-muted whitespace-pre-line">{invoice.from_address}</p>}
          </div>
          <div>
            <p className="text-xs text-app-muted uppercase tracking-wide mb-1">Bill To</p>
            <p className="font-semibold text-app-text">{invoice.to_name}</p>
            {invoice.to_email && <p className="text-sm text-app-muted">{invoice.to_email}</p>}
            {invoice.to_address && <p className="text-sm text-app-muted whitespace-pre-line">{invoice.to_address}</p>}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 rounded-lg bg-white/5 p-4">
          <MetaItem label="Date" value={new Date(invoice.created_at).toLocaleDateString()} />
          <MetaItem label="Due Date" value={invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '—'} warn={!!isOverdue} />
          <MetaItem label="Payment Terms" value={invoice.payment_terms || 'Net 30'} />
          <MetaItem label="Currency" value={cur} />
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs text-app-muted uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Description</th>
              <th className="px-4 py-3 text-center">Qty</th>
              <th className="px-4 py-3 text-right">Unit Price</th>
              <th className="px-4 py-3 text-right">Tax</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.line_items || []).map((li, i) => (
              <tr key={li.id || i} className="border-b border-white/5">
                <td className="px-4 py-3 text-app-text">{li.description}</td>
                <td className="px-4 py-3 text-center text-app-muted">{Number(li.quantity)}</td>
                <td className="px-4 py-3 text-right text-app-muted">{fmt(li.unit_price, cur)}</td>
                <td className="px-4 py-3 text-right text-app-muted">
                  {Number(li.tax_rate) > 0 ? `${li.tax_rate}%` : '—'}
                </td>
                <td className="px-4 py-3 text-right font-medium text-app-text">{fmt(li.line_total, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="flex justify-end">
          <div className="w-80 space-y-2 text-sm">
            <Row label="Subtotal" value={fmt(invoice.subtotal, cur)} />
            {Number(invoice.tax_amount) > 0 && <Row label="Tax" value={fmt(invoice.tax_amount, cur)} />}
            {Number(invoice.discount_amount) > 0 && (
              <Row
                label={`Discount${invoice.discount_pct ? ` (${invoice.discount_pct}%)` : ''}`}
                value={`-${fmt(invoice.discount_amount, cur)}`}
                valueClass="text-green-400"
              />
            )}
            <div className="border-t border-white/10 pt-2 flex justify-between text-base font-bold text-app-text">
              <span>Grand Total</span>
              <span>{fmt(grandTotal, cur)}</span>
            </div>
            {amountPaid > 0 && (
              <>
                <Row label="Amount Paid" value={`-${fmt(amountPaid, cur)}`} valueClass="text-green-400" />
                <div className="border-t border-white/10 pt-2 flex justify-between font-bold">
                  <span className="text-app-text">Balance Due</span>
                  <span className={balanceDue > 0 ? 'text-red-400' : 'text-green-400'}>{fmt(balanceDue, cur)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Notes / Payment Instructions */}
      {(invoice.notes || invoice.payment_instructions) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {invoice.notes && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <h3 className="text-xs font-semibold text-app-muted uppercase tracking-wide mb-2">Notes</h3>
              <p className="text-sm text-app-text whitespace-pre-line">{invoice.notes}</p>
            </div>
          )}
          {invoice.payment_instructions && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
              <h3 className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-2">Payment Instructions</h3>
              <p className="text-sm text-app-text whitespace-pre-line">{invoice.payment_instructions}</p>
            </div>
          )}
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#1a1d24] rounded-xl border border-white/10 p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-app-text flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary-400" /> Record Payment
              </h3>
              <button onClick={() => { setShowPaymentModal(false); setPaymentError(''); }} className="text-app-muted hover:text-app-text">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-app-muted">Invoice Total</span>
                <span className="text-app-text font-medium">{fmt(grandTotal, cur)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-app-muted">Already Paid</span>
                <span className="text-app-text font-medium">{fmt(amountPaid, cur)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-app-muted">Balance Due</span>
                <span className="text-app-text">{fmt(balanceDue, cur)}</span>
              </div>

              <div>
                <label className="block text-xs text-app-muted mb-1">Payment Amount</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={paymentAmount}
                  onChange={(e) => { setPaymentAmount(e.target.value); setPaymentError(''); }}
                  placeholder={balanceDue.toFixed(2)}
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none"
                />
              </div>

              {paymentError && (
                <p className="text-sm text-red-400">{paymentError}</p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setPaymentAmount(balanceDue.toFixed(2)); }}
                  className="px-3 py-2 bg-white/5 border border-white/10 text-app-text rounded-lg text-sm hover:bg-white/10"
                >
                  Full Balance
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => { setShowPaymentModal(false); setPaymentError(''); }}
                  className="px-4 py-2 text-app-muted hover:text-app-text text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRecordPayment}
                  disabled={actionLoading === 'payment'}
                  className="px-4 py-2 bg-primary-500 text-app-text rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
                >
                  {actionLoading === 'payment' ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  loading = false,
  variant = 'default',
}: {
  icon: typeof Send;
  label: string;
  onClick: () => void;
  loading?: boolean;
  variant?: 'default' | 'primary' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50',
        variant === 'primary' && 'bg-primary-500 text-app-text hover:bg-primary-600',
        variant === 'danger' && 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20',
        variant === 'default' && 'bg-white/5 border border-white/10 text-app-text hover:bg-white/10',
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}

function MetaItem({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs text-app-muted uppercase tracking-wide">{label}</p>
      <p className={cn('text-sm font-medium', warn ? 'text-red-400' : 'text-app-text')}>{value}</p>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between text-app-muted">
      <span>{label}</span>
      <span className={cn('font-medium', valueClass || 'text-app-text')}>{value}</span>
    </div>
  );
}

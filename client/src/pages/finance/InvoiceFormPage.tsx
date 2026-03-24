import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI, type FinanceInvoice } from '@/lib/financeApi';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Plus, Trash2, Save, Send, Loader2,
  Upload, Camera, X, CheckCircle, Sparkles,
} from 'lucide-react';

type ConfidenceLevel = 'high' | 'medium' | 'low' | null;

interface LineItemRow {
  key: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
}

function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

const emptyLine = (): LineItemRow => ({
  key: newKey(),
  description: '',
  quantity: 1,
  unit_price: 0,
  tax_rate: 0,
});

interface InvoiceFormPageProps {
  invoiceId?: string;
  onBack: () => void;
  onSaved: (id: string) => void;
}

export function InvoiceFormPage({ invoiceId, onBack, onSaved }: InvoiceFormPageProps) {
  const user = useAuthStore((s) => s.user);
  const userId = user?.authUserId || user?.id || '';
  const isEdit = Boolean(invoiceId);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [fromName, setFromName] = useState('Messign Communications');
  const [fromEmail, setFromEmail] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [toName, setToName] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [paymentInstructions, setPaymentInstructions] = useState('');
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [discountPct, setDiscountPct] = useState(0);
  const [invoiceType, setInvoiceType] = useState('standard');
  const [dueDate, setDueDate] = useState('');
  const [lineItems, setLineItems] = useState<LineItemRow[]>([emptyLine()]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState<'weekly' | 'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [recurringAutoSend, setRecurringAutoSend] = useState(false);

  // Dora scan state
  const [scanning, setScanning] = useState(false);
  const [scanConfidence, setScanConfidence] = useState<number | null>(null);
  const [scanFieldCount, setScanFieldCount] = useState(0);
  const [scannedFields, setScannedFields] = useState<Set<string>>(new Set());
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const scanFileRef = useRef<HTMLInputElement>(null);
  const [scanDragOver, setScanDragOver] = useState(false);

  const fieldConfidence = useCallback((field: string): ConfidenceLevel => {
    if (!scannedFields.has(field) || scanConfidence == null) return null;
    if (scanConfidence >= 0.85) return 'high';
    if (scanConfidence >= 0.5) return 'medium';
    return 'low';
  }, [scannedFields, scanConfidence]);

  const handleScanFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') return;
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setScanPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
    setScanning(true);
    setError('');
    try {
      const { extraction } = await financeAPI.scanInvoiceDocument(userId, file);
      const filled = new Set<string>();
      let count = 0;

      if (extraction.vendor_name) { setToName(extraction.vendor_name); filled.add('toName'); count++; }
      if (extraction.vendor_email) { setToEmail(extraction.vendor_email); filled.add('toEmail'); count++; }
      if (extraction.vendor_address) { setToAddress(extraction.vendor_address); filled.add('toAddress'); count++; }
      if (extraction.currency) {
        const supported = ['USD', 'EUR', 'GBP', 'TRY', 'CAD', 'AUD'];
        const upper = extraction.currency.toUpperCase();
        if (supported.includes(upper)) { setCurrency(upper); filled.add('currency'); count++; }
      }
      if (extraction.payment_terms) {
        const termsMap: Record<string, string> = {
          'due on receipt': 'Due on Receipt', 'net 15': 'Net 15', 'net 30': 'Net 30',
          'net 45': 'Net 45', 'net 60': 'Net 60', 'net 90': 'Net 90',
        };
        const matched = termsMap[extraction.payment_terms.toLowerCase()] || null;
        if (matched) { setPaymentTerms(matched); filled.add('paymentTerms'); count++; }
      }
      if (extraction.due_date) { setDueDate(extraction.due_date); filled.add('dueDate'); count++; }
      if (extraction.discount_pct != null && extraction.discount_pct > 0) {
        setDiscountPct(extraction.discount_pct); filled.add('discountPct'); count++;
      }
      if (extraction.notes) { setNotes(extraction.notes); filled.add('notes'); count++; }
      if (extraction.payment_instructions) {
        setPaymentInstructions(extraction.payment_instructions); filled.add('paymentInstructions'); count++;
      }
      if (extraction.invoice_number) {
        setInternalNotes((prev) => {
          const prefix = 'Vendor Invoice #: ' + extraction.invoice_number;
          return prev ? prefix + '\n' + prev : prefix;
        });
        filled.add('internalNotes'); count++;
      }
      if (extraction.line_items.length > 0) {
        setLineItems(extraction.line_items.map((li) => ({
          key: newKey(),
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          tax_rate: li.tax_rate,
        })));
        filled.add('lineItems'); count++;
      }

      if (count === 0) {
        setError('Dora could not extract any fields from this document. Please ensure the image is clear and contains invoice data.');
        setScanPreview(null);
      } else {
        setScannedFields(filled);
        setScanConfidence(extraction.confidence);
        setScanFieldCount(count);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan document');
      setScanPreview(null);
    } finally {
      setScanning(false);
    }
  }, [userId]);

  const dismissScan = () => {
    setScanConfidence(null);
    setScanFieldCount(0);
    setScanPreview(null);
  };

  useEffect(() => {
    if (!isEdit || !invoiceId || !userId) return;
    setLoading(true);
    financeAPI.getInvoice(userId, invoiceId).then((inv: FinanceInvoice) => {
      setFromName(inv.from_name || '');
      setFromEmail(inv.from_email || '');
      setFromAddress(inv.from_address || '');
      setToName(inv.to_name || '');
      setToEmail(inv.to_email || '');
      setToAddress(inv.to_address || '');
      setCurrency(inv.currency || 'USD');
      setPaymentTerms(inv.payment_terms || 'Net 30');
      setPaymentInstructions(inv.payment_instructions || '');
      setNotes(inv.notes || '');
      setInternalNotes(inv.internal_notes || '');
      setDiscountPct(inv.discount_pct || 0);
      setInvoiceType(inv.invoice_type || 'standard');
      setDueDate(inv.due_date ? inv.due_date.slice(0, 10) : '');
      if (inv.line_items?.length) {
        setLineItems(
          inv.line_items.map((li) => ({
            key: newKey(),
            description: li.description,
            quantity: Number(li.quantity),
            unit_price: Number(li.unit_price),
            tax_rate: Number(li.tax_rate || 0),
          })),
        );
      }
    }).catch(() => setError('Failed to load invoice'))
      .finally(() => setLoading(false));
  }, [isEdit, invoiceId, userId]);

  const updateLine = useCallback((key: string, field: keyof LineItemRow, value: string | number) => {
    setLineItems((prev) =>
      prev.map((li) => (li.key === key ? { ...li, [field]: value } : li)),
    );
  }, []);

  const addLine = () => setLineItems((prev) => [...prev, emptyLine()]);

  const removeLine = (key: string) =>
    setLineItems((prev) => (prev.length <= 1 ? prev : prev.filter((li) => li.key !== key)));

  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((s, li) => s + li.quantity * li.unit_price, 0);
    const taxTotal = lineItems.reduce(
      (s, li) => s + (li.tax_rate ? li.quantity * li.unit_price * li.tax_rate / 100 : 0), 0,
    );
    const discountAmt = discountPct ? subtotal * discountPct / 100 : 0;
    const grandTotal = subtotal + taxTotal - discountAmt;
    return { subtotal, taxTotal, discountAmt, grandTotal };
  }, [lineItems, discountPct]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);

  const handleSave = async (andSend = false) => {
    if (!toName.trim()) { setError('Client / Vendor name is required'); return; }
    if (lineItems.every((li) => !li.description.trim())) { setError('At least one line item is required'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        from_name: fromName,
        from_email: fromEmail || undefined,
        from_address: fromAddress || undefined,
        to_name: toName,
        to_email: toEmail || undefined,
        to_address: toAddress || undefined,
        currency,
        payment_terms: paymentTerms,
        payment_instructions: paymentInstructions || undefined,
        notes: notes || undefined,
        internal_notes: internalNotes || undefined,
        discount_pct: discountPct || undefined,
        invoice_type: invoiceType,
        due_date: dueDate || undefined,
        is_recurring: isRecurring || undefined,
        recurring_config: isRecurring ? {
          frequency: recurringFrequency,
          next_date: dueDate || new Date().toISOString().split('T')[0],
          end_date: recurringEndDate || undefined,
          auto_send: recurringAutoSend,
        } : undefined,
        line_items: lineItems
          .filter((li) => li.description.trim())
          .map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unit_price: li.unit_price,
            tax_rate: li.tax_rate || undefined,
          })),
      };

      let result: FinanceInvoice;
      if (isEdit && invoiceId) {
        result = await financeAPI.updateInvoice(userId, invoiceId, payload);
      } else {
        result = await financeAPI.createInvoice(userId, payload);
      }

      if (andSend && result.id) {
        await financeAPI.sendInvoice(userId, result.id);
      }

      onSaved(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save invoice');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-app-muted hover:text-app-text transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-app-text rounded-lg text-sm font-medium hover:bg-white/10 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 text-app-text rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Save & Send
          </button>
        </div>
      </div>

      <h2 className="text-xl font-bold text-app-text">
        {isEdit ? 'Edit Invoice' : 'New Invoice'}
      </h2>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Dora Invoice Scan */}
      {!isEdit && (
        <div className="rounded-xl border border-white/10 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-transparent backdrop-blur-sm p-5">
          {scanConfidence != null && scanFieldCount > 0 ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-emerald-500/20">
                  <CheckCircle className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-app-text">
                    Dora extracted {scanFieldCount} field{scanFieldCount !== 1 ? 's' : ''} with {Math.round(scanConfidence * 100)}% confidence
                  </p>
                  <p className="text-xs text-app-muted mt-0.5">Review the auto-filled fields below and make corrections if needed</p>
                </div>
              </div>
              <button onClick={dismissScan} className="p-1.5 rounded-lg hover:bg-white/10 text-app-muted hover:text-app-text transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-app-text">Scan Invoice with Dora</h3>
              </div>
              <div
                onDragOver={(e) => { e.preventDefault(); setScanDragOver(true); }}
                onDragLeave={() => setScanDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setScanDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleScanFile(f); }}
                onClick={() => scanFileRef.current?.click()}
                className={cn(
                  'relative rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all',
                  scanDragOver ? 'border-purple-500 bg-purple-500/10' : 'border-white/20 hover:border-white/30 hover:bg-white/5',
                )}
              >
                <input ref={scanFileRef} type="file" accept="image/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleScanFile(f); }} className="hidden" />
                {scanning ? (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <Loader2 className="h-8 w-8 text-purple-400 animate-spin" />
                    <p className="text-sm text-app-text">Dora is scanning your invoice...</p>
                    <p className="text-xs text-app-muted">Extracting vendor details, line items, and totals</p>
                  </div>
                ) : scanPreview ? (
                  <div className="flex items-center gap-4">
                    <img src={scanPreview} alt="Scanned" className="h-16 rounded-lg border border-white/10" />
                    <p className="text-sm text-app-muted">Processing complete. Upload another to re-scan.</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-full bg-white/5"><Upload className="h-5 w-5 text-app-muted" /></div>
                      <div className="p-2.5 rounded-full bg-white/5"><Camera className="h-5 w-5 text-app-muted" /></div>
                    </div>
                    <p className="text-sm text-app-text font-medium">Drop your invoice document here</p>
                    <p className="text-xs text-app-muted">or click to browse. Supports JPG, PNG, PDF</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* From / To */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-app-text uppercase tracking-wide">From</h3>
          <Field label="Name" value={fromName} onChange={setFromName} />
          <Field label="Email" value={fromEmail} onChange={setFromEmail} type="email" />
          <Field label="Address" value={fromAddress} onChange={setFromAddress} multiline />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-app-text uppercase tracking-wide">Bill To</h3>
          <Field label="Name *" value={toName} onChange={setToName} confidence={fieldConfidence('toName')} />
          <Field label="Email" value={toEmail} onChange={setToEmail} type="email" confidence={fieldConfidence('toEmail')} />
          <Field label="Address" value={toAddress} onChange={setToAddress} multiline confidence={fieldConfidence('toAddress')} />
        </div>
      </div>

      {/* Invoice Details Row */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h3 className="text-sm font-semibold text-app-text uppercase tracking-wide mb-3">Details</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-app-muted mb-1">Type</label>
            <select
              value={invoiceType}
              onChange={(e) => setInvoiceType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none"
            >
              <option value="standard">Standard</option>
              <option value="credit_note">Credit Note</option>
              <option value="proforma">Proforma</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-app-muted mb-1">Currency</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none"
            >
              {['USD', 'EUR', 'GBP', 'TRY', 'CAD', 'AUD'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-app-muted mb-1">Payment Terms</label>
            <select
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none"
            >
              {['Due on Receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90'].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-app-muted mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-app-text uppercase tracking-wide">Line Items</h3>
          <button
            onClick={addLine}
            className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 font-medium"
          >
            <Plus className="h-3.5 w-3.5" /> Add Row
          </button>
        </div>

        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_110px_80px_110px_32px] gap-2 text-xs text-app-muted uppercase tracking-wide px-1">
            <span>Description</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Unit Price</span>
            <span className="text-center">Tax %</span>
            <span className="text-right">Total</span>
            <span />
          </div>

          {lineItems.map((li) => {
            const lineTotal = li.quantity * li.unit_price;
            const lineTax = li.tax_rate ? lineTotal * li.tax_rate / 100 : 0;
            return (
              <div
                key={li.key}
                className="grid grid-cols-[1fr_80px_110px_80px_110px_32px] gap-2 items-center"
              >
                <input
                  type="text"
                  value={li.description}
                  onChange={(e) => updateLine(li.key, 'description', e.target.value)}
                  placeholder="Item description"
                  className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={li.quantity}
                  onChange={(e) => updateLine(li.key, 'quantity', Number(e.target.value))}
                  className="px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text text-center focus:border-primary-500 focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={li.unit_price}
                  onChange={(e) => updateLine(li.key, 'unit_price', Number(e.target.value))}
                  className="px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text text-right focus:border-primary-500 focus:outline-none"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={li.tax_rate}
                  onChange={(e) => updateLine(li.key, 'tax_rate', Number(e.target.value))}
                  className="px-2 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text text-center focus:border-primary-500 focus:outline-none"
                />
                <div className="text-right text-sm font-medium text-app-text pr-1">
                  {fmt(lineTotal + lineTax)}
                </div>
                <button
                  onClick={() => removeLine(li.key)}
                  className="p-1 text-app-muted hover:text-red-400 transition-colors"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Totals */}
        <div className="mt-4 pt-4 border-t border-white/10 flex justify-end">
          <div className="w-72 space-y-2 text-sm">
            <div className="flex justify-between text-app-muted">
              <span>Subtotal</span>
              <span className="font-medium text-app-text">{fmt(totals.subtotal)}</span>
            </div>
            {totals.taxTotal > 0 && (
              <div className="flex justify-between text-app-muted">
                <span>Tax</span>
                <span className="font-medium text-app-text">{fmt(totals.taxTotal)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-app-muted gap-2">
              <span>Discount</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={discountPct}
                  onChange={(e) => setDiscountPct(Number(e.target.value))}
                  className="w-16 px-2 py-1 rounded bg-white/5 border border-white/10 text-xs text-app-text text-center focus:border-primary-500 focus:outline-none"
                />
                <span className="text-xs">%</span>
                {totals.discountAmt > 0 && (
                  <span className="text-green-400 font-medium ml-2">-{fmt(totals.discountAmt)}</span>
                )}
              </div>
            </div>
            <div className="flex justify-between pt-2 border-t border-white/10 text-base font-bold text-app-text">
              <span>Total</span>
              <span>{fmt(totals.grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recurring Configuration */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-app-text uppercase tracking-wide">Recurring Invoice</h3>
          <button
            onClick={() => setIsRecurring(!isRecurring)}
            className={cn('w-10 h-5 rounded-full relative transition-colors', isRecurring ? 'bg-primary-500' : 'bg-white/20')}
          >
            <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', isRecurring ? 'right-0.5' : 'left-0.5')} />
          </button>
        </div>
        {isRecurring && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-xs text-app-muted mb-1">Frequency</label>
              <select value={recurringFrequency} onChange={(e) => setRecurringFrequency(e.target.value as typeof recurringFrequency)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none">
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">End Date (optional)</label>
              <input type="date" value={recurringEndDate} onChange={(e) => setRecurringEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none" />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-app-text cursor-pointer">
                <input type="checkbox" checked={recurringAutoSend} onChange={(e) => setRecurringAutoSend(e.target.checked)}
                  className="rounded accent-primary-500" />
                Auto-send when generated
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-app-text uppercase tracking-wide">Notes (visible to client)</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Payment terms, thank-you message, etc."
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none resize-none"
          />
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-app-text uppercase tracking-wide">Payment Instructions</h3>
          <textarea
            value={paymentInstructions}
            onChange={(e) => setPaymentInstructions(e.target.value)}
            rows={3}
            placeholder="Bank details, wire instructions, etc."
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none resize-none"
          />
        </div>
      </div>

      {/* Internal Notes */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-app-text uppercase tracking-wide">Internal Notes (not visible to client)</h3>
        <textarea
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={2}
          placeholder="Internal tracking, PO reference, etc."
          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none resize-none"
        />
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  multiline = false,
  confidence,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
  confidence?: ConfidenceLevel;
}) {
  const borderColor = confidence === 'high' ? 'border-l-emerald-500' : confidence === 'medium' ? 'border-l-amber-500' : confidence === 'low' ? 'border-l-red-500' : '';
  const cls = cn(
    'w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none',
    confidence && `border-l-2 ${borderColor}`,
  );
  return (
    <div>
      <label className="block text-xs text-app-muted mb-1">
        {label}
        {confidence && (
          <span className={cn('ml-1.5 text-[10px] font-medium',
            confidence === 'high' ? 'text-emerald-400' : confidence === 'medium' ? 'text-amber-400' : 'text-red-400')}>
            AI
          </span>
        )}
      </label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={cn(cls, 'resize-none')} />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </div>
  );
}

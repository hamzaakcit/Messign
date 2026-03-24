import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI } from '@/lib/financeApi';
import { mileageAPI } from '@/lib/api';
import { MileageCalculator } from '@/components/reimbursement/MileageCalculator';
import { ReceiptUploader } from '@/components/finance/ReceiptUploader';
import { ArrowLeft, Receipt, MapPin, AlertTriangle, CheckCircle, Sparkles, Image } from 'lucide-react';
import { cn } from '@/lib/utils';

type ExpenseType = 'receipt' | 'mileage';

interface OCRField {
  value: string;
  confidence: 'high' | 'medium' | 'low' | null;
  source: 'ocr' | 'user';
}

interface NewExpensePageProps {
  onBack: () => void;
  onCreated: (id: string) => void;
}

const confidenceBorder: Record<string, string> = {
  high: 'border-emerald-500/50',
  medium: 'border-amber-500/50',
  low: 'border-red-500/50',
};

export function NewExpensePage({ onBack, onCreated }: NewExpensePageProps) {
  const user = useAuthStore((s) => s.user);
  const userId = user?.authUserId || user?.id || '';

  const [expenseType, setExpenseType] = useState<ExpenseType>('receipt');
  const [form, setForm] = useState({
    title: '',
    description: '',
    amount: '',
    currency: 'USD',
    expense_date: new Date().toISOString().split('T')[0],
    category_slug: '',
    tax_amount: '',
    notes: '',
  });
  const [mileageAmount, setMileageAmount] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Receipt / OCR state
  const [draftId, setDraftId] = useState<string | null>(null);
  const [receiptDoc, setReceiptDoc] = useState<{ id: string; file_url: string } | null>(null);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<{
    vendor_name: string | null; amount: number | null; currency: string | null;
    date: string | null; category: string | null; confidence: number;
  } | null>(null);
  const [fieldConfidence, setFieldConfidence] = useState<Record<string, OCRField['confidence']>>({});

  // Duplicate warning state
  const [duplicates, setDuplicates] = useState<Array<{ id: string; title: string; original_amount: number; expense_date: string; status: string }>>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Budget check state
  const [budgetInfo, setBudgetInfo] = useState<{ department: string; remaining: number; allocated: number; pct: number } | null>(null);
  const [categoryDeptMap, setCategoryDeptMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (userId) {
      financeAPI.getCategoryDepartmentMap(userId).then(setCategoryDeptMap).catch(() => {});
    }
  }, [userId]);

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldConfidence((prev) => ({ ...prev, [field]: null }));
    setError('');
    if (field === 'category_slug') {
      if (!value || !userId) {
        setBudgetInfo(null);
        return;
      }
      const department = categoryDeptMap[value] || 'General';
      financeAPI.listBudgets(userId, {}).then((budgets: unknown[]) => {
        const b = budgets.find((b: unknown) => {
          const bObj = b as { department?: string };
          return bObj.department === department;
        }) as { department?: string; remaining?: number | string; allocated_amount?: number | string; allocatedAmount?: number | string; spent_amount?: number | string; spent?: number | string; utilization_pct?: number | string; utilizationPct?: number | string } | undefined;
        if (b) {
          const alloc = Number(b.allocated_amount ?? b.allocatedAmount ?? 0) || 0;
          const spent = Number(b.spent_amount ?? b.spent ?? 0) || 0;
          const rem = Number(b.remaining ?? (alloc - spent)) || 0;
          const pctVal = b.utilization_pct ?? b.utilizationPct;
          const pct = pctVal != null ? Number(pctVal) / 100 : (alloc > 0 ? spent / alloc : 0);
          setBudgetInfo({ department: b.department || '', remaining: rem, allocated: alloc, pct });
        } else {
          setBudgetInfo(null);
        }
      }).catch(() => setBudgetInfo(null));
    }
  };

  // Debounced duplicate check
  const checkDuplicates = useCallback(async (amount: string, date: string) => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0 || !date || !userId) return;
    try {
      const result = await financeAPI.checkDuplicate(userId, amt, date);
      setDuplicates(result.duplicates);
    } catch {
      // silently fail
    }
  }, [userId]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      checkDuplicates(form.amount, form.expense_date);
    }, 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form.amount, form.expense_date, checkDuplicates]);

  const handleReceiptUpload = async (file: File) => {
    try {
      let expenseId = draftId;
      if (!expenseId) {
        const draft = await financeAPI.createExpense(userId, {
          title: form.title.trim() || 'Receipt upload',
          amount: 0.01,
          currency: form.currency,
          expense_date: form.expense_date,
        });
        expenseId = draft.id;
        setDraftId(expenseId);
      }

      const doc = await financeAPI.uploadReceipt(userId, expenseId, file);
      setReceiptDoc({ id: doc.id, file_url: doc.file_url });

      // Auto-trigger OCR
      setOcrProcessing(true);
      try {
        const ocrRes = await financeAPI.triggerOCR(userId, expenseId, doc.id);
        setOcrResult(ocrRes.extraction);
        applyOCRFields(ocrRes.extraction);
      } catch (ocrErr) {
        console.error('OCR failed:', ocrErr);
      } finally {
        setOcrProcessing(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Receipt upload failed');
    }
  };

  const applyOCRFields = (extraction: typeof ocrResult) => {
    if (!extraction) return;
    const conf = extraction.confidence;
    const level = (v: unknown): OCRField['confidence'] =>
      v == null ? null : conf >= 0.85 ? 'high' : conf >= 0.5 ? 'medium' : 'low';

    const updates: Record<string, string> = {};
    const confUpdates: Record<string, OCRField['confidence']> = {};

    if (extraction.vendor_name) {
      updates.title = extraction.vendor_name;
      confUpdates.title = level(extraction.vendor_name);
    }
    if (extraction.amount != null) {
      updates.amount = String(extraction.amount);
      confUpdates.amount = level(extraction.amount);
    }
    if (extraction.currency) {
      updates.currency = extraction.currency;
      confUpdates.currency = level(extraction.currency);
    }
    if (extraction.date) {
      updates.expense_date = extraction.date;
      confUpdates.expense_date = level(extraction.date);
    }
    if (extraction.category) {
      const slugMap: Record<string, string> = {
        travel: 'travel_flight', meals: 'meals_business', office_supplies: 'office_supplies',
        software: 'software_subscription', equipment: 'office_equipment',
        transportation: 'travel_ground', accommodation: 'travel_hotel',
        communication: 'communication_phone', training: 'training_course',
        entertainment: 'meals_client', medical: 'healthcare', other: 'other',
      };
      const slug = slugMap[extraction.category] || extraction.category;
      updates.category_slug = slug;
      confUpdates.category_slug = level(extraction.category);
    }

    setForm((prev) => ({ ...prev, ...updates }));
    setFieldConfidence(confUpdates);
  };

  const handleMileageResult = (amount: number, _distanceKm: number, _ratePerKm: number, currency: string) => {
    setMileageAmount(amount);
    setForm((prev) => ({ ...prev, amount: amount.toFixed(2), currency, category_slug: 'travel_ground' }));
  };

  const handleMileageCalculate = async (data: { origin_address: string; destination_address: string; is_round_trip?: boolean }) => {
    return mileageAPI.calculate(userId, data) as Promise<{
      distance_km: number; rate_per_km: number; calculated_amount: number; currency: string; is_round_trip?: boolean;
    }>;
  };

  const handleMileageGetRate = async () => {
    return mileageAPI.getRate(userId) as Promise<{ ratePerKm: number; currency: string }>;
  };

  const handleSubmit = async (asDraft: boolean) => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    const amt = expenseType === 'mileage' ? mileageAmount : parseFloat(form.amount);
    if (!amt || amt <= 0) {
      setError(expenseType === 'mileage' ? 'Calculate mileage first' : 'Valid amount is required');
      return;
    }
    if (!form.expense_date) { setError('Date is required'); return; }

    setSubmitting(true);
    try {
      let expenseId = draftId;

      if (expenseId) {
        await financeAPI.updateExpense(userId, expenseId, {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          amount: amt,
          currency: form.currency,
          expense_date: form.expense_date,
          category_slug: form.category_slug || (expenseType === 'mileage' ? 'travel_ground' : undefined),
          tax_amount: form.tax_amount ? parseFloat(form.tax_amount) : undefined,
          notes: form.notes.trim() || undefined,
        });
      } else {
        const expense = await financeAPI.createExpense(userId, {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          amount: amt,
          currency: form.currency,
          expense_date: form.expense_date,
          category_slug: form.category_slug || (expenseType === 'mileage' ? 'travel_ground' : undefined),
          tax_amount: form.tax_amount ? parseFloat(form.tax_amount) : undefined,
          notes: form.notes.trim() || undefined,
        });
        expenseId = expense.id;
      }

      if (!asDraft) {
        await financeAPI.submitExpense(userId, expenseId!);
      }

      onCreated(expenseId!);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create expense');
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = (field: string) =>
    cn(
      'w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none',
      fieldConfidence[field] ? confidenceBorder[fieldConfidence[field]!] : 'border-app-border',
    );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-app-muted hover:text-app-text transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Expenses
      </button>

      <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary-500/10 p-2.5">
            {expenseType === 'mileage' ? <MapPin className="h-5 w-5 text-primary-500" /> : <Receipt className="h-5 w-5 text-primary-500" />}
          </div>
          <h2 className="text-lg font-semibold text-app-text">New Expense</h2>
        </div>

        {/* Expense Type Selector */}
        <div>
          <label className="block text-xs font-medium text-app-muted mb-2">Expense Type</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setExpenseType('receipt'); setMileageAmount(null); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                expenseType === 'receipt' ? 'bg-primary-500/15 border-primary-500/40 text-primary-400' : 'bg-app-surface-tertiary border-app-border text-app-muted hover:bg-app-hover'
              }`}
            >
              <Receipt className="h-4 w-4" /> Receipt / Standard
            </button>
            <button
              type="button"
              onClick={() => { setExpenseType('mileage'); setForm((p) => ({ ...p, category_slug: 'travel_ground' })); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                expenseType === 'mileage' ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' : 'bg-app-surface-tertiary border-app-border text-app-muted hover:bg-app-hover'
              }`}
            >
              <MapPin className="h-4 w-4" /> Mileage Claim
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
        )}

        {/* Receipt Uploader */}
        {expenseType === 'receipt' && (
          <div>
            <label className="block text-xs font-medium text-app-muted mb-2">Receipt</label>
            {receiptDoc ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-app-surface-tertiary border border-app-border">
                <Image className="h-5 w-5 text-emerald-400" />
                <span className="text-sm text-app-text flex-1">Receipt uploaded</span>
                {ocrProcessing && <span className="text-xs text-primary-400 animate-pulse flex items-center gap-1"><Sparkles className="h-3 w-3" /> Extracting data...</span>}
                {ocrResult && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> {Math.round(ocrResult.confidence * 100)}% confidence
                  </span>
                )}
              </div>
            ) : (
              <ReceiptUploader onUpload={handleReceiptUpload} />
            )}
            {ocrResult && (
              <div className="mt-2 p-3 rounded-lg bg-primary-500/5 border border-primary-500/20 text-xs space-y-1">
                <p className="text-primary-400 font-medium flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI extracted fields (review below)</p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {ocrResult.vendor_name && <span className="px-2 py-0.5 rounded bg-app-surface-tertiary text-app-muted">Vendor: {ocrResult.vendor_name}</span>}
                  {ocrResult.amount != null && <span className="px-2 py-0.5 rounded bg-app-surface-tertiary text-app-muted">Amount: {ocrResult.currency} {ocrResult.amount}</span>}
                  {ocrResult.date && <span className="px-2 py-0.5 rounded bg-app-surface-tertiary text-app-muted">Date: {ocrResult.date}</span>}
                  {ocrResult.category && <span className="px-2 py-0.5 rounded bg-app-surface-tertiary text-app-muted">Category: {ocrResult.category}</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Duplicate Warning */}
        {duplicates.length > 0 && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-amber-400">Possible Duplicate</span>
            </div>
            <div className="space-y-1">
              {duplicates.map((d) => (
                <p key={d.id} className="text-xs text-app-muted">
                  "{d.title}" — ${d.original_amount} on {new Date(d.expense_date).toLocaleDateString()} ({d.status})
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Mileage Calculator */}
        {expenseType === 'mileage' && (
          <MileageCalculator
            onCalculate={handleMileageCalculate}
            getRate={handleMileageGetRate}
            onResult={handleMileageResult}
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-app-muted mb-1.5">
              Title * {fieldConfidence.title && <ConfidenceDot level={fieldConfidence.title} />}
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder={expenseType === 'mileage' ? 'e.g. Client visit - Istanbul to Ankara' : 'e.g. Client dinner at Nobu'}
              className={inputClass('title')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-app-muted mb-1.5">
              Amount * {fieldConfidence.amount && <ConfidenceDot level={fieldConfidence.amount} />}
              {expenseType === 'mileage' && mileageAmount != null && ' (calculated)'}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => handleChange('amount', e.target.value)}
                placeholder="0.00"
                readOnly={expenseType === 'mileage'}
                className={cn(inputClass('amount'), 'flex-1', expenseType === 'mileage' && 'opacity-60 cursor-not-allowed')}
              />
              <select
                value={form.currency}
                onChange={(e) => handleChange('currency', e.target.value)}
                disabled={expenseType === 'mileage'}
                className={cn('w-24 px-2 py-2 rounded-lg bg-app-surface-tertiary border text-sm text-app-text focus:border-primary-500 focus:outline-none',
                  fieldConfidence.currency ? confidenceBorder[fieldConfidence.currency!] : 'border-app-border',
                  expenseType === 'mileage' && 'opacity-60 cursor-not-allowed')}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="TRY">TRY</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-app-muted mb-1.5">
              Date * {fieldConfidence.expense_date && <ConfidenceDot level={fieldConfidence.expense_date} />}
            </label>
            <input
              type="date"
              value={form.expense_date}
              onChange={(e) => handleChange('expense_date', e.target.value)}
              className={inputClass('expense_date')}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-app-muted mb-1.5">
              Category {fieldConfidence.category_slug && <ConfidenceDot level={fieldConfidence.category_slug} />}
            </label>
            <select
              value={form.category_slug}
              onChange={(e) => handleChange('category_slug', e.target.value)}
              disabled={expenseType === 'mileage'}
              className={cn(inputClass('category_slug'), expenseType === 'mileage' && 'opacity-60 cursor-not-allowed')}
            >
              <option value="">Select category</option>
              {(() => {
                const CATEGORY_LABELS: Record<string, string> = {
                  travel_flight: 'Travel - Flights', travel_hotel: 'Travel - Hotels', travel_ground: 'Travel - Ground',
                  meals_business: 'Meals - Business', meals_team: 'Meals - Team', meals_client: 'Meals - Client',
                  office_supplies: 'Office Supplies', office_equipment: 'Office Equipment',
                  software_subscription: 'Software - Subscription', software_license: 'Software - License',
                  marketing_ads: 'Marketing - Ads', marketing_events: 'Marketing - Events',
                  training_course: 'Training - Courses', training_conference: 'Training - Conference',
                  professional_legal: 'Professional - Legal', professional_consulting: 'Professional - Consulting',
                  utilities: 'Utilities', communication_phone: 'Communication - Phone',
                  communication_internet: 'Communication - Internet', healthcare: 'Healthcare', other: 'Other',
                };
                const grouped = new Map<string, string[]>();
                for (const [slug, dept] of Object.entries(categoryDeptMap)) {
                  if (!grouped.has(dept)) grouped.set(dept, []);
                  grouped.get(dept)!.push(slug);
                }
                if (grouped.size === 0) {
                  return Object.entries(CATEGORY_LABELS).map(([slug, label]) => (
                    <option key={slug} value={slug}>{label}</option>
                  ));
                }
                return Array.from(grouped.entries()).map(([dept, slugs]) => (
                  <optgroup key={dept} label={dept}>
                    {slugs.map((slug) => (
                      <option key={slug} value={slug}>{CATEGORY_LABELS[slug] || slug}</option>
                    ))}
                  </optgroup>
                ));
              })()}
            </select>
            {budgetInfo && (
              <div className={cn('mt-1.5 flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg',
                budgetInfo.pct >= 1 ? 'bg-red-500/10 text-red-400' : budgetInfo.pct >= 0.8 ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400')}>
                <span className="font-medium">{budgetInfo.department}:</span>
                <span>${Number(budgetInfo.remaining).toFixed(0)} remaining of ${Number(budgetInfo.allocated).toFixed(0)}</span>
                <span>({(budgetInfo.pct * 100).toFixed(0)}% used)</span>
              </div>
            )}
            {form.category_slug && !budgetInfo && categoryDeptMap[form.category_slug] && (
              <div className="mt-1.5 flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                <span>No active budget for {categoryDeptMap[form.category_slug]}</span>
              </div>
            )}
          </div>

          {expenseType !== 'mileage' && (
            <div>
              <label className="block text-xs font-medium text-app-muted mb-1.5">Tax Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.tax_amount}
                onChange={(e) => handleChange('tax_amount', e.target.value)}
                placeholder="0.00"
                className={inputClass('tax_amount')}
              />
            </div>
          )}

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-app-muted mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
              placeholder={expenseType === 'mileage' ? 'Purpose of the trip...' : 'Brief description of the expense...'}
              className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none resize-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-app-muted mb-1.5">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={2}
              placeholder="Any additional notes..."
              className="w-full px-3 py-2 rounded-lg bg-app-surface-tertiary border border-app-border text-sm text-app-text placeholder:text-app-muted focus:border-primary-500 focus:outline-none resize-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => handleSubmit(true)}
            disabled={submitting}
            className="px-6 py-2.5 rounded-lg bg-app-surface-tertiary border border-app-border text-sm font-medium text-app-text hover:bg-app-hover transition-colors disabled:opacity-50"
          >
            Save as Draft
          </button>
          <button
            onClick={() => handleSubmit(false)}
            disabled={submitting}
            className="px-6 py-2.5 rounded-lg bg-primary-500 text-app-text text-sm font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Creating...' : 'Submit for Approval'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfidenceDot({ level }: { level: 'high' | 'medium' | 'low' }) {
  const colors = { high: 'bg-emerald-500', medium: 'bg-amber-500', low: 'bg-red-500' };
  const labels = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };
  return (
    <span className="inline-flex items-center gap-1 ml-1" title={labels[level]}>
      <span className={cn('inline-block h-1.5 w-1.5 rounded-full', colors[level])} />
      <span className="text-[10px] text-app-muted">{labels[level]}</span>
    </span>
  );
}

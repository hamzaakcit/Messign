import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useReimbursementContext } from '@/contexts/ReimbursementContext';
import {
  reimbursementAPI,
  categoriesAPI,
  exchangeRatesAPI,
  mileageAPI,
} from '@/lib/api';
import { Button } from '@/components/ui';
import { DocumentUploader, type OCROutput } from '@/components/reimbursement/DocumentUploader';
import { MileageCalculator } from '@/components/reimbursement/MileageCalculator';
import { PolicyGuardModal } from '@/components/reimbursement/PolicyGuardModal';

interface ReimbursementDoc {
  id: string;
  file_name: string;
  document_type: string;
  ocr_processed?: boolean;
  ocr_vendor_name?: string;
  ocr_amount?: number;
  ocr_currency?: string;
  ocr_date?: string;
}

interface ReimbursementFormProps {
  id?: string;
  onSuccess: (id: string) => void;
  onCancel: () => void;
}

export function ReimbursementForm({ id, onSuccess, onCancel }: ReimbursementFormProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const reimbContext = useReimbursementContext();
  const refreshCounts = reimbContext?.refreshCounts;
  const [categories, setCategories] = useState<{ id: string; name: string; icon?: string }[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [originalAmount, setOriginalAmount] = useState('');
  const [originalCurrency, setOriginalCurrency] = useState('USD');
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [documents, setDocuments] = useState<ReimbursementDoc[]>([]);
  const [mileageAmount, setMileageAmount] = useState<number | null>(null);
  const [expenseType, setExpenseType] = useState<'receipt' | 'mileage' | 'invoice'>('receipt');
  const [loading, setLoading] = useState(false);
  const [policyModal, setPolicyModal] = useState<{ open: boolean; limit: string; amount: string } | null>(null);
  /** When user uploads on new request we create a draft and set this so we can navigate to edit. */
  const [draftId, setDraftId] = useState<string | null>(null);
  const effectiveId = id ?? draftId;

  useEffect(() => {
    if (!user?.id) return;
    categoriesAPI.list(user.id)
      .then((data: any) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, [user?.id]);

  useEffect(() => {
    if (id && user?.id) {
      setDraftId(null);
      reimbursementAPI.getById(user.id, id)
        .then((r: any) => {
          setTitle(r.title ?? '');
          setDescription(r.description ?? '');
          setCategoryId(r.category_id ?? '');
          setExpenseDate(r.expense_date ?? '');
          setOriginalAmount(String(r.original_amount ?? ''));
          setOriginalCurrency(r.original_currency ?? 'USD');
          setConvertedAmount(r.converted_amount != null ? parseFloat(r.converted_amount) : null);
          setExchangeRate(r.exchange_rate != null ? parseFloat(r.exchange_rate) : null);
          setDocuments(r.documents ?? []);
        })
        .catch(() => { /* failed to hydrate edit form */ });
    }
  }, [id, user?.id]);

  const handleAmountOrCurrencyChange = async () => {
    if (!user?.id || !originalAmount) return;
    const from = originalCurrency;
    const to = 'EUR'; // Invoices use EUR; converted_amount must be in EUR
    if (from === to) {
      setConvertedAmount(parseFloat(originalAmount));
      setExchangeRate(1);
      return;
    }
    // Use expense date for rate (historical); YYYY-MM-DD. If not set, backend will use today.
    let dateParam: string | undefined;
    if (expenseDate) {
      const d = expenseDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dateParam = d;
      else if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(d)) {
        const [day, month, year] = d.split('.');
        dateParam = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
    try {
      const res = await exchangeRatesAPI.get(user.id, from, to, dateParam);
      const rate = res.rate ?? 1;
      setExchangeRate(rate);
      setConvertedAmount(parseFloat(originalAmount) * rate);
    } catch {
      setExchangeRate(1);
      setConvertedAmount(parseFloat(originalAmount));
    }
  };

  useEffect(() => {
    if (originalAmount && originalCurrency) handleAmountOrCurrencyChange();
  }, [originalAmount, originalCurrency, expenseDate]);

  const handleSubmit = async (_justification?: string) => {
    if (!user?.id) return;
    const amount = mileageAmount ?? parseFloat(originalAmount) ?? 0;
    const catId = categoryId || categories[0]?.id;
    if (!title || !catId || !expenseDate) return;
    setLoading(true);
    try {
      const payload: any = {
        title,
        description: description || undefined,
        category_id: catId,
        original_amount: amount,
        original_currency: originalCurrency,
        expense_date: expenseDate,
        exchange_rate: exchangeRate ?? undefined,
        converted_amount: convertedAmount ?? amount,
      };
      if (id) {
        await reimbursementAPI.update(user.id, id, payload);
        refreshCounts?.();
        onSuccess(id);
      } else {
        const created: any = await reimbursementAPI.create(user.id, payload);
        const rid = created.id;
        refreshCounts?.();
        onSuccess(rid);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!user?.id) return;
    if (!id) {
      const amount = mileageAmount ?? parseFloat(originalAmount) ?? 0;
      const catId = categoryId || categories[0]?.id;
      if (!title || !catId || !expenseDate) return;
      setLoading(true);
      try {
        const payload: any = {
          title,
          description: description || undefined,
          category_id: catId,
          original_amount: amount,
          original_currency: originalCurrency,
          expense_date: expenseDate,
          exchange_rate: exchangeRate ?? undefined,
          converted_amount: convertedAmount ?? amount,
        };
        const created: any = await reimbursementAPI.create(user.id, payload);
        const rid = created.id;
        await reimbursementAPI.submit(user.id, rid);
        refreshCounts?.();
        onSuccess(rid);
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      await reimbursementAPI.submit(user.id, id);
      refreshCounts?.();
      onSuccess(id);
    } finally {
      setLoading(false);
    }
  };

  const uploadDocument = async (file: File, documentType?: string) => {
    if (!user?.id || !effectiveId) return {} as unknown;
    return reimbursementAPI.uploadDocument(user.id, effectiveId, file, documentType);
  };

  const handleCreateDraftAndUpload = async (file: File | Blob, filename: string, documentType: string) => {
    if (!user?.id) throw new Error('Not authenticated');
    const catId = categoryId || categories[0]?.id;
    const today = new Date().toISOString().slice(0, 10);
    const payload: any = {
      title: title || 'Draft',
      description: description || undefined,
      category_id: catId || undefined,
      original_amount: parseFloat(originalAmount) || 0,
      original_currency: originalCurrency,
      expense_date: expenseDate || today,
      exchange_rate: exchangeRate ?? undefined,
      converted_amount: convertedAmount ?? parseFloat(originalAmount) ?? 0,
    };
    if (!payload.category_id) throw new Error('Please select a category first');
    setLoading(true);
    try {
      const created: any = await reimbursementAPI.create(user.id, payload);
      const rid = created?.id;
      if (!rid || typeof rid !== 'string') throw new Error('Failed to create draft — no ID returned');
      const f = file instanceof File ? file : new File([file], filename, { type: 'image/jpeg' });
      await reimbursementAPI.uploadDocument(user.id, rid, f, documentType);
      refreshCounts?.();
      setDraftId(rid);
      setDocuments((d) => [...d, { id: 'temp', file_name: filename, document_type: documentType }]);
      navigate(`/reimbursements/${rid}/edit`);
    } catch (err) {
      // Re-throw so DocumentUploader's catch can display the error
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleOCRApply = (data: OCROutput) => {
    if (data.vendor_name != null && data.vendor_name !== '') setTitle(data.vendor_name);
    if (data.amount != null) setOriginalAmount(String(data.amount));
    if (data.currency != null && data.currency !== '') setOriginalCurrency(data.currency);
    if (data.date != null && data.date !== '') setExpenseDate(data.date);
  };

  if (!user?.id) return null;

  return (
    <div className="h-full overflow-auto bg-app transition-colors duration-200">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <h2 className="text-xl font-semibold text-app">{id ? 'Edit Reimbursement' : 'New Reimbursement Request'}</h2>

        <div className="rounded-xl border border-app-border bg-dark-800 overflow-hidden">
          <div className="p-5 space-y-5">
            {!id && (
              <>
                <p className="text-xs font-semibold text-app-muted uppercase tracking-wide">Expense Type</p>
                <div className="flex gap-2 flex-wrap">
                  {(['receipt', 'mileage', 'invoice'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setExpenseType(type)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                        expenseType === type ? 'bg-primary-500 text-white' : 'bg-app-hover text-app-muted hover:text-app'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-app-muted mb-1.5">Category *</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="input-theme w-full"
              >
                <option value="">Select category...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-app-muted mb-1.5">Description *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Client dinner with Acme Corp"
                className="input-theme w-full"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-app-muted mb-1.5">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={originalAmount}
                  onChange={(e) => setOriginalAmount(e.target.value)}
                  placeholder="0.00"
                  className="input-theme w-full"
                  readOnly={expenseType === 'mileage'}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-app-muted mb-1.5">Currency</label>
                <select
                  value={originalCurrency}
                  onChange={(e) => setOriginalCurrency(e.target.value)}
                  className="input-theme w-full"
                  disabled={expenseType === 'mileage'}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="TRY">TRY</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-app-muted mb-1.5">Date *</label>
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                className="input-theme w-full"
              />
            </div>
            {expenseType === 'mileage' && (
              <div className="rounded-lg border border-app-border bg-app p-4">
                <p className="text-xs font-semibold text-app-muted mb-2">Mileage</p>
                <MileageCalculator
                  onCalculate={(data) => mileageAPI.calculate(user.id, data) as Promise<any>}
                  getRate={() => mileageAPI.getRate(user.id)}
                  onResult={(amount) => setMileageAmount(amount)}
                />
              </div>
            )}
            {convertedAmount != null && expenseType !== 'mileage' && (
              <p className="text-sm text-app-muted">
                Converted: {Number(convertedAmount).toFixed(2)} EUR {exchangeRate != null && `(rate: ${exchangeRate})`}
              </p>
            )}
            <div>
              <label className="block text-xs font-semibold text-app-muted mb-1.5">Additional Notes</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Business purpose (required for meals over $50)"
                rows={3}
                className="input-theme w-full resize-none"
              />
            </div>
          </div>
        </div>

        {(effectiveId || expenseType === 'receipt' || expenseType === 'invoice') && (
          <div className="rounded-xl border border-app-border bg-dark-800 p-5">
            <p className="text-xs font-semibold text-app-muted uppercase tracking-wide mb-3">Documents</p>
            <DocumentUploader
              reimbursementId={effectiveId ?? undefined}
              type={expenseType === 'invoice' ? 'invoice' : 'receipt'}
              documents={documents}
              onUpload={uploadDocument}
              onDocumentAdded={(doc) => setDocuments((d) => [...d, doc as ReimbursementDoc])}
              onCreateDraftAndUpload={!effectiveId ? handleCreateDraftAndUpload : undefined}
              onOCRApply={expenseType === 'receipt' ? handleOCRApply : undefined}
              deleteDocument={async (docId) => {
                if (!effectiveId) return;
                await reimbursementAPI.deleteDocument(user.id, effectiveId, docId);
                setDocuments((d) => d.filter((x) => x.id !== docId));
              }}
              triggerOCR={async (docId) => {
                if (!effectiveId) return {} as unknown;
                const doc = await reimbursementAPI.triggerOCR(user.id, effectiveId, docId);
                setDocuments((d) => d.map((x) => (x.id === docId ? (doc as ReimbursementDoc) : x)));
                return doc;
              }}
              disabled={loading}
            />
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onCancel}>
            {id ? 'Cancel' : 'Back'}
          </Button>
          <Button variant="secondary" onClick={() => handleSubmit()} disabled={loading}>
            Save as Draft
          </Button>
          <Button onClick={() => handleSubmitForApproval()} disabled={loading}>
            {id ? 'Submit for Approval' : 'Create & Submit'}
          </Button>
        </div>
      </div>

      {policyModal?.open && (
        <PolicyGuardModal
          open={policyModal.open}
          onClose={() => setPolicyModal(null)}
          title="Spending Limit Exceeded"
          message="This expense exceeds the configured limit. Please provide a business justification."
          amount={policyModal.amount}
          limit={policyModal.limit}
          onConfirm={(justification) => handleSubmit(justification)}
        />
      )}
    </div>
  );
}

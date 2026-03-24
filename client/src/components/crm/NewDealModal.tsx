import { useState } from 'react';
import { Modal } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { crmAPI } from '@/lib/crmApi';
import type { DealStage } from '@/lib/crmApi';

interface NewDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId: string;
  stages: DealStage[];
  onCreated: () => void;
}

export function NewDealModal({ isOpen, onClose, pipelineId, stages, onCreated }: NewDealModalProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId ?? user?.id ?? '';

  const [title, setTitle] = useState('');
  const [stageId, setStageId] = useState(stages[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [expectedClose, setExpectedClose] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Deal title is required'); return; }
    if (!stageId) { setError('Please select a stage'); return; }

    setSubmitting(true);
    setError('');
    try {
      await crmAPI.createDeal(userId, {
        title: title.trim(),
        pipeline_id: pipelineId,
        stage_id: stageId,
        amount: amount ? parseFloat(amount) : undefined,
        currency: currency || undefined,
        expected_close_date: expectedClose || undefined,
        notes: notes.trim() || undefined,
      });
      onCreated();
      resetForm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create deal');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setStageId(stages[0]?.id ?? '');
    setAmount('');
    setCurrency('USD');
    setExpectedClose('');
    setNotes('');
    setError('');
  };

  const inputClass =
    'w-full rounded-lg border border-app-border bg-app-inputBg px-3 py-2 text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Deal" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-app-muted mb-1">Title *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className={inputClass}
            placeholder="e.g. Acme Corp — Enterprise License"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-app-muted mb-1">Stage</label>
            <select
              value={stageId}
              onChange={e => setStageId(e.target.value)}
              className={inputClass}
            >
              {stages.filter(s => !s.is_won && !s.is_lost).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-app-muted mb-1">Amount</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className={inputClass}
                placeholder="0"
                min="0"
                step="0.01"
              />
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="rounded-lg border border-app-border bg-app-inputBg px-2 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500 w-20 shrink-0"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="TRY">TRY</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-app-muted mb-1">Expected Close Date</label>
          <input
            type="date"
            value={expectedClose}
            onChange={e => setExpectedClose(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-app-muted mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="Optional notes..."
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Creating...' : 'Create Deal'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

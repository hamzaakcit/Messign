import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { RejectionReason } from '../../approvalQueue/types';

const REASONS: { value: RejectionReason; label: string }[] = [
  { value: 'off_brand', label: 'Off brand' },
  { value: 'factually_wrong', label: 'Factually wrong' },
  { value: 'wrong_audience', label: 'Wrong audience' },
  { value: 'needs_polish', label: 'Needs polish' },
  { value: 'other', label: 'Other' },
];

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentTitle: string;
  onSubmit: (payload: { reason: RejectionReason; feedback: string }) => void;
}

export function FeedbackModal({ isOpen, onClose, contentTitle, onSubmit }: FeedbackModalProps) {
  const [reason, setReason] = useState<RejectionReason>('needs_polish');
  const [feedback, setFeedback] = useState('');

  const handleSubmit = () => {
    onSubmit({ reason, feedback: feedback.trim() });
    setFeedback('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Request revision" size="lg">
      <p className="text-sm text-app-muted mb-3">
        Feedback for: <span className="text-app-text font-medium">{contentTitle}</span>
      </p>
      <label className="block text-xs text-app-muted mb-1">Reason</label>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value as RejectionReason)}
        className="w-full bg-app-surface-tertiary border border-app-border rounded-lg px-3 py-2 text-sm text-app-text mb-4"
      >
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <label className="block text-xs text-app-muted mb-1">Specific feedback for Content Strategist</label>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={5}
        placeholder="What should change before regeneration?"
        className="w-full bg-app-surface-tertiary border border-app-border rounded-lg px-3 py-2 text-sm text-app-text placeholder:text-app-muted resize-y min-h-[120px]"
      />
      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-sm text-app-muted hover:text-app-text hover:bg-app-nav-hover"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-200 border border-amber-500/30 hover:bg-amber-500/30"
        >
          Submit revision request
        </button>
      </div>
    </Modal>
  );
}

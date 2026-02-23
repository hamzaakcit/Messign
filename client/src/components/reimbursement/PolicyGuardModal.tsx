import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import { Modal } from '@/components/ui';

interface PolicyGuardModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  amount: string;
  limit: string;
  onConfirm: (justification: string) => void;
  confirmLabel?: string;
}

export function PolicyGuardModal({
  open,
  onClose,
  title,
  message,
  amount,
  limit,
  onConfirm,
  confirmLabel = 'Submit with Justification',
}: PolicyGuardModalProps) {
  const [justification, setJustification] = useState('');

  const handleConfirm = () => {
    onConfirm(justification);
    setJustification('');
    onClose();
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="flex gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-app-muted">{message}</p>
        </div>
        <p className="text-sm text-app-muted">
          This expense ({amount}) exceeds the limit of {limit}.
        </p>
        <div>
          <label className="block text-sm text-app-muted mb-1">Business justification (required)</label>
          <textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder="Explain why this expense was necessary"
            rows={3}
            className="input-theme"
          />
        </div>
        <p className="text-xs text-app-muted">Over-limit expenses require additional approval.</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!justification.trim()}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

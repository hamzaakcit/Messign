import { useState } from 'react';
import { X, Flag } from 'lucide-react';
import { Button } from '@/components/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  documentTitle: string;
}

export function FlagModal({ open, onClose, onSubmit, documentTitle }: Props) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    await onSubmit(reason.trim());
    setSubmitting(false);
    setReason('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="rounded-xl border border-app-border bg-app-sidebar w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-app-border">
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-amber-400" />
            <h3 className="font-semibold text-app">Flag as Outdated</h3>
          </div>
          <button onClick={onClose} className="text-app-muted hover:text-app"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">
          <p className="text-sm text-app-muted mb-3">
            Flagging <span className="font-medium text-app">"{documentTitle}"</span> as outdated
          </p>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Why is this document outdated? What needs updating?"
            className="w-full h-24 p-3 rounded-lg bg-app-card border border-app-border text-app text-sm placeholder:text-app-muted resize-none focus:outline-none focus:border-primary-500"
          />
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-app-border">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!reason.trim() || submitting} className="bg-amber-600 hover:bg-amber-500">
            {submitting ? 'Submitting...' : 'Submit Flag'}
          </Button>
        </div>
      </div>
    </div>
  );
}

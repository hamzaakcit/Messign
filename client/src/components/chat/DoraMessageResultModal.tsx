import { X, Copy, Check, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface DoraMessageResultModalProps {
  open: boolean;
  title: string;
  body: string;
  loading?: boolean;
  onClose: () => void;
  onApply?: (text: string) => void;
  applyLabel?: string;
}

export function DoraMessageResultModal({
  open,
  title,
  body,
  loading = false,
  onClose,
  onApply,
  applyLabel = 'Use text',
}: DoraMessageResultModalProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-label="Close dialog" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dora-result-title"
        className="relative w-full max-w-lg bg-app-sidebar border border-app rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-app flex items-center justify-between">
          <h2 id="dora-result-title" className="text-sm font-semibold text-app">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-app-muted hover:text-app" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 max-h-[min(60vh,320px)] overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-app-muted py-8 justify-center">
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden />
              <span className="text-sm">Dora is thinking…</span>
            </div>
          ) : (
            <p className="text-sm text-app whitespace-pre-wrap leading-relaxed">{body || '—'}</p>
          )}
        </div>
        <div className="px-4 py-3 border-t border-app flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCopy}
            disabled={loading || !body}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-app transition-colors',
              'text-app-muted hover:text-app hover:bg-app-hover disabled:opacity-50',
            )}
            aria-label="Copy to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          {onApply && (
            <button
              type="button"
              onClick={() => { onApply(body); onClose(); }}
              disabled={loading || !body}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {applyLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

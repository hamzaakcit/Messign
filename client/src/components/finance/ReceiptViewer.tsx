import { X, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReceiptViewerProps {
  imageUrl: string;
  fileName: string;
  extractedData?: {
    vendor?: string;
    amount?: number;
    date?: string;
    currency?: string;
    items?: Array<{ description: string; amount: number }>;
  };
  isVerified?: boolean;
  verifiedMethod?: string;
  onClose: () => void;
}

export function ReceiptViewer({ imageUrl, fileName, extractedData, isVerified, verifiedMethod, onClose }: ReceiptViewerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-4xl w-full mx-4 grid grid-cols-1 lg:grid-cols-2 gap-4" onClick={(e) => e.stopPropagation()}>
        {/* Image */}
        <div className="rounded-xl border border-white/10 bg-black overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
            <span className="text-sm text-app-text font-medium truncate">{fileName}</span>
            <div className="flex items-center gap-2">
              <a href={imageUrl} target="_blank" rel="noopener" className="p-1 text-app-muted hover:text-app-text">
                <ExternalLink className="h-4 w-4" />
              </a>
              <button onClick={onClose} className="p-1 text-app-muted hover:text-app-text">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <img src={imageUrl} alt="Receipt" className="w-full h-auto max-h-[70vh] object-contain" />
        </div>

        {/* OCR Results */}
        {extractedData && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-app-text">Extracted Data</h3>
              {isVerified != null && (
                <div className={cn('flex items-center gap-1 text-xs', isVerified ? 'text-emerald-400' : 'text-amber-400')}>
                  {isVerified ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                  {isVerified ? `Verified (${verifiedMethod})` : 'Pending verification'}
                </div>
              )}
            </div>

            <div className="space-y-3 text-sm">
              {extractedData.vendor && (
                <div className="flex justify-between"><span className="text-app-muted">Vendor</span><span className="text-app-text font-medium">{extractedData.vendor}</span></div>
              )}
              {extractedData.amount != null && (
                <div className="flex justify-between"><span className="text-app-muted">Amount</span><span className="text-app-text font-medium">{extractedData.currency ?? '$'}{extractedData.amount.toLocaleString()}</span></div>
              )}
              {extractedData.date && (
                <div className="flex justify-between"><span className="text-app-muted">Date</span><span className="text-app-text">{extractedData.date}</span></div>
              )}
            </div>

            {extractedData.items && extractedData.items.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-app-muted uppercase tracking-wide mb-2">Line Items</h4>
                <div className="space-y-1">
                  {extractedData.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-app-text">{item.description}</span>
                      <span className="text-app-muted">${item.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

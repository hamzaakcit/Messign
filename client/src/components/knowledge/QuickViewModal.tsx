import { useState } from 'react';
import DOMPurify from 'dompurify';
import { X, Download, Link2, Pin, FileText, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { KbDocument } from './DocumentCard';

interface Props {
  document: KbDocument | null;
  onClose: () => void;
  onDownload: (doc: KbDocument) => void;
  onPin: (doc: KbDocument) => void;
  onAcknowledge?: (doc: KbDocument) => void;
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function QuickViewModal({ document: doc, onClose, onDownload, onPin, onAcknowledge }: Props) {
  const [ackChecked, setAckChecked] = useState(false);

  if (!doc) return null;

  const uploadsOrigin = (import.meta.env.VITE_API_ORIGIN as string) || window.location.origin;
  const fileUrl = doc.file_url ? (doc.file_url.startsWith('http') ? doc.file_url : `${uploadsOrigin}${doc.file_url}`) : null;
  const tags = (doc.tags ?? []).map(t => typeof t === 'string' ? { id: t, name: t, slug: t } : t);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/knowledge/${doc.slug}`);
    toast.success('Link copied!');
  };

  const renderPreview = () => {
    const ft = doc.file_type ?? doc.type;
    if (ft === 'pdf' && fileUrl) {
      return <iframe src={fileUrl} className="w-full h-[50vh] rounded-lg border border-gray-200" title="PDF Preview" />;
    }
    if (ft === 'image' && fileUrl) {
      return <img src={fileUrl} alt={doc.title} className="max-w-full max-h-[50vh] mx-auto rounded-lg" />;
    }
    if (ft === 'video' && fileUrl) {
      return <video src={fileUrl} controls className="w-full max-h-[50vh] rounded-lg" />;
    }
    if (doc.content && doc.content.trim()) {
      return (
        <div className="prose prose-sm max-w-none bg-gray-50 rounded-lg p-6 max-h-[50vh] overflow-auto text-gray-900">
          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(doc.content.replace(/\n/g, '<br/>')) }} />
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-gray-50 rounded-lg">
        <FileText className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-app-muted font-medium">{doc.file_type?.toUpperCase() ?? 'Document'}</p>
        {fileUrl && (
          <Button onClick={() => onDownload(doc)} className="mt-4 gap-2">
            <Download className="w-4 h-4" /> Download to view
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="rounded-xl bg-white w-full max-w-3xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-gray-900 text-lg truncate pr-4">{doc.title}</h3>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onDownload(doc)} className="p-2 rounded-lg text-app-muted hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Download">
              <Download className="w-5 h-5" />
            </button>
            <button onClick={handleCopyLink} className="p-2 rounded-lg text-app-muted hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Copy Link">
              <Link2 className="w-5 h-5" />
            </button>
            <button onClick={() => onPin(doc)} className={cn('p-2 rounded-lg transition-colors', doc.user_pinned ? 'text-indigo-600 bg-indigo-50' : 'text-app-muted hover:text-indigo-600 hover:bg-indigo-50')} title={doc.user_pinned ? 'Unpin' : 'Pin'}>
              <Pin className="w-5 h-5" fill={doc.user_pinned ? 'currentColor' : 'none'} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-app-muted hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Preview */}
          <div className="mb-6">
            {renderPreview()}
          </div>

          {/* Metadata */}
          <div className="space-y-3 text-sm">
            {doc.version_label && (
              <div className="flex gap-3"><span className="text-app-muted w-24 shrink-0">Version</span><span className="text-gray-900 font-medium">{doc.version_label}</span></div>
            )}
            {doc.category_name && (
              <div className="flex gap-3"><span className="text-app-muted w-24 shrink-0">Category</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium border" style={doc.category_color ? { borderColor: doc.category_color + '40', color: doc.category_color } : undefined}>
                  {doc.category_name}
                </span>
              </div>
            )}
            <div className="flex gap-3"><span className="text-app-muted w-24 shrink-0">Updated</span><span className="text-gray-900">{doc.author_name} on {formatDate(doc.updated_at)}</span></div>
            {doc.description && (
              <div className="flex gap-3"><span className="text-app-muted w-24 shrink-0">Description</span><span className="text-gray-700">{doc.description}</span></div>
            )}
            <div className="flex gap-3"><span className="text-app-muted w-24 shrink-0">File</span>
              <span className="text-gray-700 uppercase">{doc.file_type ?? doc.type}{doc.file_size_bytes ? ` · ${formatSize(doc.file_size_bytes)}` : ''} · Downloaded {doc.download_count} times</span>
            </div>
            {tags.length > 0 && (
              <div className="flex gap-3"><span className="text-app-muted w-24 shrink-0">Tags</span>
                <div className="flex flex-wrap gap-1">
                  {tags.map(t => (
                    <span key={t.id} className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">{t.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Acknowledge section */}
          {doc.is_required_reading && !doc.user_acknowledged && onAcknowledge && (
            <div className="mt-8 border-t-2 border-amber-400 pt-6">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                <label className="flex items-start gap-3 cursor-pointer flex-1">
                  <input type="checkbox" checked={ackChecked} onChange={e => setAckChecked(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
                  <span className="text-sm text-amber-900">I have read and acknowledge this document</span>
                </label>
                <Button onClick={() => { onAcknowledge(doc); setAckChecked(false); }} disabled={!ackChecked}
                  className="shrink-0 bg-amber-600 hover:bg-amber-500 text-app-text gap-2">
                  <CheckCircle className="w-4 h-4" /> Submit
                </Button>
              </div>
            </div>
          )}

          {doc.is_required_reading && doc.user_acknowledged && (
            <div className="mt-6 flex items-center gap-2 text-emerald-600 text-sm">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">You have acknowledged this document</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

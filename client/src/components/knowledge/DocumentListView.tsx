import { FileText, Download, Eye, Pin, Image, Film, Presentation, File as FileIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KbDocument } from './DocumentCard';

interface Props {
  documents: KbDocument[];
  onView: (doc: KbDocument) => void;
  onPin: (doc: KbDocument) => void;
  onDownload: (doc: KbDocument) => void;
}

const FILE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText, pptx: Presentation, docx: FileText, image: Image, video: Film, wiki: FileText, file: FileIcon,
};

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return '-';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function DocumentListView({ documents, onView, onPin, onDownload }: Props) {
  if (!documents.length) return null;

  return (
    <div className="rounded-xl border border-app-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-dark-700 text-app-muted text-xs uppercase tracking-wider">
            <th className="text-left py-3 px-4 font-semibold">Document</th>
            <th className="text-left py-3 px-3 font-semibold hidden md:table-cell">Category</th>
            <th className="text-left py-3 px-3 font-semibold hidden lg:table-cell">Author</th>
            <th className="text-left py-3 px-3 font-semibold hidden lg:table-cell">Type</th>
            <th className="text-left py-3 px-3 font-semibold hidden md:table-cell">Updated</th>
            <th className="text-right py-3 px-4 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody>
          {documents.map(doc => {
            const IconComp = FILE_ICONS[doc.file_type ?? doc.type] ?? FileText;
            const isNew = doc.new_badge_until && new Date(doc.new_badge_until) > new Date();
            return (
              <tr key={doc.id} className="border-t border-app-border hover:bg-dark-700/50 transition-colors">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-primary-500/10')}>
                      <IconComp className="w-4 h-4 text-primary-400" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-app truncate cursor-pointer hover:text-primary-400"
                              onClick={() => onView(doc)}>
                          {doc.title}
                        </span>
                        {isNew && <span className="shrink-0 px-1 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400">NEW</span>}
                        {doc.is_required_reading && !doc.user_acknowledged && (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" title="Required reading" />
                        )}
                      </div>
                      <p className="text-xs text-app-muted truncate">{doc.description}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-3 hidden md:table-cell">
                  {doc.category_name ? (
                    <span className="text-xs px-2 py-0.5 rounded-full border border-app-border text-app-muted"
                          style={doc.category_color ? { borderColor: doc.category_color + '40', color: doc.category_color } : undefined}>
                      {doc.category_name}
                    </span>
                  ) : <span className="text-xs text-app-muted">—</span>}
                </td>
                <td className="py-3 px-3 text-xs text-app-muted hidden lg:table-cell">{doc.author_name ?? doc.author_id}</td>
                <td className="py-3 px-3 text-xs text-app-muted uppercase hidden lg:table-cell">
                  {doc.file_type ?? doc.type} {doc.file_size_bytes ? `· ${formatSize(doc.file_size_bytes)}` : ''}
                </td>
                <td className="py-3 px-3 text-xs text-app-muted hidden md:table-cell">{formatDate(doc.updated_at)}</td>
                <td className="py-3 px-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => onView(doc)} className="p-1.5 rounded text-app-muted hover:text-app hover:bg-app-hover" title="View">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => onDownload(doc)} className="p-1.5 rounded text-app-muted hover:text-primary-400 hover:bg-app-hover" title="Download">
                      <Download className="w-4 h-4" />
                    </button>
                    <button onClick={() => onPin(doc)} className={cn('p-1.5 rounded hover:bg-app-hover', doc.user_pinned ? 'text-primary-400' : 'text-app-muted hover:text-app')} title={doc.user_pinned ? 'Unpin' : 'Pin'}>
                      <Pin className="w-4 h-4" fill={doc.user_pinned ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

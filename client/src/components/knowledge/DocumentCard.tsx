import { useState } from 'react';
import {
  FileText, Download, MoreVertical, Pin, Link2, Flag,
  History, Image, Film, File, Presentation,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export interface KbDocument {
  id: string;
  title: string;
  slug: string;
  description: string;
  content?: string | null;
  tags: Array<{ id: string; name: string; slug: string }> | string[];
  author_id: string;
  author_name?: string;
  type: string;
  file_url?: string | null;
  file_type?: string | null;
  file_size_bytes?: number | null;
  thumbnail_url?: string | null;
  version: number;
  version_label?: string | null;
  category_name?: string | null;
  category_slug?: string | null;
  category_color?: string | null;
  status: string;
  is_pinned: boolean;
  is_required_reading: boolean;
  views: number;
  download_count: number;
  published_at: string;
  new_badge_until?: string | null;
  created_at: string;
  updated_at: string;
  user_pinned?: boolean;
  user_acknowledged?: boolean;
}

interface Props {
  document: KbDocument;
  onView: (doc: KbDocument) => void;
  onPin: (doc: KbDocument) => void;
  onDownload: (doc: KbDocument) => void;
  onFlag: (doc: KbDocument) => void;
  onVersionHistory?: (doc: KbDocument) => void;
  onTagClick?: (tagSlug: string) => void;
}

const FILE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  pptx: Presentation,
  docx: FileText,
  image: Image,
  video: Film,
  wiki: FileText,
  link: Link2,
  file: File,
};

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function DocumentCard({ document: doc, onView, onPin, onDownload, onFlag, onVersionHistory, onTagClick }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isNew = doc.new_badge_until && new Date(doc.new_badge_until) > new Date();
  const IconComp = FILE_ICONS[doc.file_type ?? doc.type] ?? FileText;
  const tags = (doc.tags ?? []).map(t => typeof t === 'string' ? { id: t, name: t, slug: t } : t);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/knowledge/${doc.slug}`);
    toast.success('Link copied!');
    setMenuOpen(false);
  };

  return (
    <div className="group rounded-xl border border-app-border bg-dark-800 overflow-hidden hover:border-app-border-hover transition-all hover:shadow-lg hover:shadow-black/10">
      {/* Thumbnail area */}
      <div
        className="relative h-36 bg-dark-700 flex items-center justify-center cursor-pointer overflow-hidden"
        onClick={() => onView(doc)}
      >
        {doc.thumbnail_url ? (
          <img src={doc.thumbnail_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className={cn('w-14 h-14 rounded-xl flex items-center justify-center', doc.category_color ? '' : 'bg-primary-500/20')}>
            <IconComp className="w-7 h-7 text-primary-400" style={doc.category_color ? { color: doc.category_color } : undefined} />
          </div>
        )}
        {/* Pin button (top-right, on hover) */}
        <button
          onClick={e => { e.stopPropagation(); onPin(doc); }}
          className={cn(
            'absolute top-2 right-2 p-1.5 rounded-lg transition-all',
            doc.user_pinned
              ? 'bg-primary-500/30 text-primary-400 opacity-100'
              : 'bg-black/40 text-white/70 opacity-0 group-hover:opacity-100 hover:text-white'
          )}
        >
          <Pin className="w-4 h-4" fill={doc.user_pinned ? 'currentColor' : 'none'} />
        </button>
        {/* Required reading indicator */}
        {doc.is_required_reading && !doc.user_acknowledged && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-red-500/90 text-white text-[10px] font-bold uppercase">
            Required
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start gap-2 mb-1">
          <h3 className="font-semibold text-app text-sm leading-tight line-clamp-2 flex-1 cursor-pointer hover:text-primary-400 transition-colors"
              onClick={() => onView(doc)}>
            {doc.title}
          </h3>
          {isNew && (
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              NEW
            </span>
          )}
        </div>

        {doc.description && (
          <p className="text-xs text-app-muted line-clamp-2 mb-2">{doc.description}</p>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tags.slice(0, 3).map(tag => (
              <button key={tag.id} onClick={() => onTagClick?.(tag.slug)}
                className="px-2 py-0.5 rounded text-[10px] font-medium bg-app-hover text-app-muted hover:text-app transition-colors">
                {tag.name}
              </button>
            ))}
            {tags.length > 3 && <span className="text-[10px] text-app-muted">+{tags.length - 3}</span>}
          </div>
        )}

        {/* File info */}
        <div className="flex items-center gap-2 text-xs text-app-muted mb-3">
          <IconComp className="w-3.5 h-3.5" />
          <span className="uppercase font-medium">{doc.file_type ?? doc.type}</span>
          {doc.file_size_bytes ? <span>· {formatSize(doc.file_size_bytes)}</span> : null}
        </div>

        <div className="text-xs text-app-muted mb-3">
          {doc.author_name ?? doc.author_id} · {formatDate(doc.updated_at)}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-3 border-t border-app-border">
          <button onClick={() => onDownload(doc)}
            className="flex items-center gap-1.5 text-xs font-medium text-app-muted hover:text-primary-400 transition-colors">
            <Download className="w-3.5 h-3.5" />
            Download
          </button>

          <div className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 text-app-muted hover:text-app rounded transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 bottom-full mb-1 z-50 w-48 rounded-lg border border-app-border bg-dark-800 shadow-xl py-1">
                  <button onClick={handleCopyLink}
                    className="w-full text-left px-3 py-2 text-sm text-app-muted hover:text-app hover:bg-app-hover flex items-center gap-2">
                    <Link2 className="w-4 h-4" /> Copy Link
                  </button>
                  <button onClick={() => { onPin(doc); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-app-muted hover:text-app hover:bg-app-hover flex items-center gap-2">
                    <Pin className="w-4 h-4" /> {doc.user_pinned ? 'Unpin' : 'Pin to My Shortcuts'}
                  </button>
                  <button onClick={() => { onFlag(doc); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-app-muted hover:text-app hover:bg-app-hover flex items-center gap-2">
                    <Flag className="w-4 h-4" /> Flag as Outdated
                  </button>
                  {onVersionHistory && (
                    <button onClick={() => { onVersionHistory(doc); setMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-sm text-app-muted hover:text-app hover:bg-app-hover flex items-center gap-2">
                      <History className="w-4 h-4" /> Version History
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

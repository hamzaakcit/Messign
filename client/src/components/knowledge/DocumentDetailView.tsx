import {
  ArrowLeft,
  Download,
  Pin,
  Link2,
  Flag,
  Eye,
  Calendar,
  User,
  Tag,
  Clock,
  FileText,
  MessageSquare,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, Button } from '@/components/ui';
import { toast } from 'sonner';
import type { KbDocument } from './DocumentCard';

interface DocumentDetailViewProps {
  document: KbDocument;
  onBack: () => void;
  onDownload: (doc: KbDocument) => void;
  onPin: (doc: KbDocument) => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_VARIANT: Record<string, 'green' | 'orange' | 'red' | 'default'> = {
  published: 'green',
  draft: 'orange',
  archived: 'red',
};

export function DocumentDetailView({
  document: doc,
  onBack,
  onDownload,
  onPin,
}: DocumentDetailViewProps) {
  const tags = (doc.tags ?? []).map((t) =>
    typeof t === 'string' ? { id: t, name: t, slug: t } : t,
  );

  const handleCopyLink = () => {
    navigator.clipboard.writeText(
      `${window.location.origin}/knowledge/${doc.slug}`,
    );
    toast.success('Link copied!');
  };

  const renderContent = () => {
    if (doc.file_url) {
      const ft = (doc.file_type ?? doc.type ?? '').toLowerCase();
      const origin = (import.meta as any).env?.VITE_API_ORIGIN || window.location.origin;
      const fileUrl = doc.file_url.startsWith('http') ? doc.file_url : `${origin}${doc.file_url}`;

      if (ft === 'pdf') {
        return (
          <iframe
            src={fileUrl}
            className="w-full h-[600px] rounded-lg border border-app-border"
            title={doc.title}
          />
        );
      }
      if (['image', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ft)) {
        return (
          <img
            src={fileUrl}
            alt={doc.title}
            className="max-w-full rounded-lg"
          />
        );
      }
      if (['video', 'mp4', 'webm', 'mov'].includes(ft)) {
        return (
          <video
            src={fileUrl}
            controls
            className="w-full rounded-lg"
          />
        );
      }
      return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <FileText className="w-16 h-16 mb-4 text-gray-500" />
          <p className="text-lg mb-2">File preview not available</p>
          <Button variant="primary" size="sm" onClick={() => onDownload(doc)}>
            <Download className="w-4 h-4" />
            Download File
          </Button>
        </div>
      );
    }

    if (doc.content) {
      return (
        <div
          className={cn(
            'prose prose-invert max-w-none',
            'text-white prose-headings:text-white prose-p:text-gray-300',
            'prose-strong:text-white prose-em:text-gray-300',
            'prose-a:text-blue-400 prose-blockquote:text-gray-400 prose-blockquote:border-gray-600',
            'prose-code:text-emerald-400 prose-code:bg-dark-700 prose-code:px-1 prose-code:py-0.5 prose-code:rounded',
            'prose-pre:bg-dark-700 prose-pre:border prose-pre:border-app-border',
            'prose-li:text-gray-300 prose-hr:border-app-border prose-img:rounded-lg',
          )}
          dangerouslySetInnerHTML={{ __html: doc.content }}
        />
      );
    }

    return (
      <div className="text-gray-400 text-center py-16">
        No content added yet.
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-dark-900">
      {/* Top bar */}
      <div className="sticky top-0 z-20 border-b border-app-border bg-dark-900/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 rounded-lg hover:bg-dark-700 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">{doc.title}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge
                  variant={STATUS_VARIANT[doc.status] ?? 'default'}
                  size="sm"
                >
                  {doc.status}
                </Badge>
                {doc.is_required_reading && (
                  <Badge variant="red" size="sm">
                    Required Reading
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDownload(doc)}
              className="p-2 rounded-lg hover:bg-dark-700 text-gray-400 hover:text-white transition-colors"
              title="Download"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={() => onPin(doc)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                doc.user_pinned
                  ? 'bg-primary-500/20 text-primary-400'
                  : 'hover:bg-dark-700 text-gray-400 hover:text-white',
              )}
              title="Pin"
            >
              <Pin
                className="w-5 h-5"
                fill={doc.user_pinned ? 'currentColor' : 'none'}
              />
            </button>
            <button
              onClick={handleCopyLink}
              className="p-2 rounded-lg hover:bg-dark-700 text-gray-400 hover:text-white transition-colors"
              title="Copy link"
            >
              <Link2 className="w-5 h-5" />
            </button>
            <button
              className="p-2 rounded-lg hover:bg-dark-700 text-gray-400 hover:text-white transition-colors"
              title="Report"
            >
              <Flag className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="max-w-7xl mx-auto px-6 py-6 flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border border-app-border bg-dark-800 overflow-hidden">
            <div className="p-6">{renderContent()}</div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-80 shrink-0 space-y-4">
          {/* Info card */}
          <div className="rounded-xl border border-app-border bg-dark-800 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Info</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <User className="w-4 h-4 text-gray-500" />
                <span className="text-gray-400">Author</span>
                <span className="ml-auto text-white">
                  {doc.author_name ?? doc.author_id}
                </span>
              </div>
              {doc.category_name && (
                <div className="flex items-center gap-3 text-sm">
                  <Tag className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-400">Category</span>
                  <span className="ml-auto">
                    <Badge variant="blue" size="sm">
                      {doc.category_name}
                    </Badge>
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <FileText className="w-4 h-4 text-gray-500" />
                <span className="text-gray-400">Type</span>
                <span className="ml-auto">
                  <Badge variant="default" size="sm">
                    {doc.file_type ?? doc.type}
                  </Badge>
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-gray-400">Date</span>
                <span className="ml-auto text-white">
                  {formatDate(doc.published_at || doc.created_at)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <History className="w-4 h-4 text-gray-500" />
                <span className="text-gray-400">Version</span>
                <span className="ml-auto text-white">
                  v{doc.version}
                  {doc.version_label ? ` (${doc.version_label})` : ''}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Eye className="w-4 h-4 text-gray-500" />
                <span className="text-gray-400">Views</span>
                <span className="ml-auto text-white">{doc.views}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Download className="w-4 h-4 text-gray-500" />
                <span className="text-gray-400">Downloads</span>
                <span className="ml-auto text-white">
                  {doc.download_count}
                </span>
              </div>
              {doc.file_size_bytes ? (
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-400">Size</span>
                  <span className="ml-auto text-white">
                    {formatSize(doc.file_size_bytes)}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="rounded-xl border border-app-border bg-dark-800 p-5">
              <h3 className="text-sm font-semibold text-white mb-3">
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag.id} variant="default" size="sm">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Version History */}
          <div className="rounded-xl border border-app-border bg-dark-800 p-5">
            <h3 className="text-sm font-semibold text-white mb-3">
              Version History
            </h3>
            <p className="text-sm text-gray-500">Coming soon...</p>
          </div>

          {/* Comments */}
          <div className="rounded-xl border border-app-border bg-dark-800 p-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-white">Comments</h3>
            </div>
            <p className="text-sm text-gray-500">Coming soon...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

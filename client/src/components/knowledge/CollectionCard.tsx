import { FolderOpen, Share2, FileText } from 'lucide-react';
import { toast } from 'sonner';

interface Collection {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  cover_image?: string | null;
  share_token: string;
  document_count?: number;
  created_by_name?: string;
}

interface Props {
  collection: Collection;
  onClick: (col: Collection) => void;
}

export function CollectionCard({ collection: col, onClick }: Props) {
  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${window.location.origin}/knowledge/collections/${col.share_token}`);
    toast.success('Share link copied!');
  };

  return (
    <div
      onClick={() => onClick(col)}
      className="group rounded-xl border border-app-border bg-dark-800 p-5 cursor-pointer hover:border-app-border-hover hover:shadow-lg hover:shadow-black/10 transition-all"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-11 h-11 rounded-xl bg-indigo-500/20 flex items-center justify-center">
          <FolderOpen className="w-5 h-5 text-indigo-400" />
        </div>
        <button
          onClick={handleShare}
          className="p-1.5 rounded-lg text-app-muted hover:text-primary-400 opacity-0 group-hover:opacity-100 transition-all"
          title="Copy share link"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      <h3 className="font-semibold text-app text-sm mb-1 group-hover:text-primary-400 transition-colors">{col.name}</h3>
      {col.description && (
        <p className="text-xs text-app-muted line-clamp-2 mb-3">{col.description}</p>
      )}

      <div className="flex items-center gap-2 text-xs text-app-muted">
        <FileText className="w-3.5 h-3.5" />
        <span>{col.document_count ?? 0} items</span>
      </div>
    </div>
  );
}

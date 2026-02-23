import { DocumentCard, type KbDocument } from './DocumentCard';

interface Props {
  documents: KbDocument[];
  onView: (doc: KbDocument) => void;
  onPin: (doc: KbDocument) => void;
  onDownload: (doc: KbDocument) => void;
  onFlag: (doc: KbDocument) => void;
  onVersionHistory?: (doc: KbDocument) => void;
  onTagClick?: (tagSlug: string) => void;
}

/* ── Skeleton card placeholder ── */
function DocumentCardSkeleton() {
  return (
    <div className="rounded-xl border border-app-border bg-dark-800 overflow-hidden animate-pulse">
      <div className="h-36 bg-dark-700" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-dark-700 rounded w-3/4" />
        <div className="h-3 bg-dark-700 rounded w-full" />
        <div className="h-3 bg-dark-700 rounded w-1/2" />
        <div className="flex gap-1.5 pt-1">
          <div className="h-5 w-12 bg-dark-700 rounded" />
          <div className="h-5 w-10 bg-dark-700 rounded" />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <div className="h-3 w-3 bg-dark-700 rounded" />
          <div className="h-3 w-16 bg-dark-700 rounded" />
        </div>
        <div className="pt-3 border-t border-app-border flex items-center justify-between">
          <div className="h-4 w-20 bg-dark-700 rounded" />
          <div className="h-4 w-4 bg-dark-700 rounded" />
        </div>
      </div>
    </div>
  );
}

export function DocumentGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="break-inside-avoid">
          <DocumentCardSkeleton />
        </div>
      ))}
    </div>
  );
}

export function DocumentGrid({ documents, onView, onPin, onDownload, onFlag, onVersionHistory, onTagClick }: Props) {
  if (!documents.length) return null;

  return (
    <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
      {documents.map(doc => (
        <div key={doc.id} className="break-inside-avoid">
          <DocumentCard
            document={doc}
            onView={onView}
            onPin={onPin}
            onDownload={onDownload}
            onFlag={onFlag}
            onVersionHistory={onVersionHistory}
            onTagClick={onTagClick}
          />
        </div>
      ))}
    </div>
  );
}

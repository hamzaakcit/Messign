import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, FileText } from 'lucide-react';
import { khBookmarksAPI } from '@/lib/knowledge-hub/api';
import type { KhDocument } from '@/types/knowledge-hub';
import { DOCUMENT_TYPE_META } from '@/types/knowledge-hub';

export function BookmarksPage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<KhDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    khBookmarksAPI.list().then(setDocs).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-app-text mb-6 flex items-center gap-2"><Bookmark className="w-5 h-5 text-yellow-400" /> Bookmarks</h1>

      {loading ? (
        <div className="text-center py-20 text-app-muted">Loading...</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-20 text-app-muted">
          <Bookmark className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p className="text-lg">No bookmarks yet</p>
          <p className="text-sm mt-1">Bookmark documents to quickly find them later</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => {
            const typeMeta = DOCUMENT_TYPE_META[doc.document_type];
            return (
              <button key={doc.id} onClick={() => navigate(`/knowledge-hub/documents/${doc.slug}`)} className="text-left w-full flex items-center gap-4 p-3 rounded-lg bg-app-sidebar border border-app-border hover:border-primary-500/40 transition-all group">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: typeMeta?.color + '20' }}>
                  <FileText className="w-4 h-4" style={{ color: typeMeta?.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-app-text group-hover:text-primary-400 truncate">{doc.title}</h3>
                  <p className="text-xs text-app-muted truncate">{doc.author_name} · {new Date(doc.updated_at).toLocaleDateString()}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

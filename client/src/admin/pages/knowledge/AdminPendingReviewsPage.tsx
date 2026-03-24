import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Clock, User } from 'lucide-react';
import { khWorkflowAPI } from '@/lib/knowledge-hub/api';
import type { KhDocument } from '@/types/knowledge-hub';
import { DOCUMENT_TYPE_META } from '@/types/knowledge-hub';

export function AdminPendingReviewsPage() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<KhDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    khWorkflowAPI.pendingReviews().then(setDocs).catch(console.error).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-app-text mb-6 flex items-center gap-2"><Clock className="w-5 h-5 text-yellow-400" /> Pending Reviews</h1>

      {loading ? (
        <div className="text-center py-10 text-app-muted">Loading...</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-20 text-app-muted">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p className="text-lg">No pending reviews</p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map(doc => {
            const typeMeta = DOCUMENT_TYPE_META[doc.document_type];
            return (
              <button key={doc.id} onClick={() => navigate(`/knowledge-hub/documents/${doc.slug}`)} className="text-left w-full p-4 rounded-xl bg-app-sidebar border border-app-border hover:border-yellow-500/30 transition-all group">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-500/20 text-yellow-400">In Review</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: typeMeta?.color + '20', color: typeMeta?.color }}>{typeMeta?.label}</span>
                </div>
                <h3 className="text-base font-medium text-app-text group-hover:text-yellow-400 mb-1">{doc.title}</h3>
                <div className="flex items-center gap-3 text-xs text-app-muted">
                  <span className="flex items-center gap-1"><User className="w-3 h-3" /> {doc.author_name}</span>
                  <span>Submitted {new Date(doc.updated_at).toLocaleDateString()}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

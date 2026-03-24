import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Sparkles } from 'lucide-react';
import { khDocumentsAPI } from '@/lib/knowledge-hub/api';
import type { KhDocument } from '@/types/knowledge-hub';
import { DOCUMENT_TYPE_META } from '@/types/knowledge-hub';

export function RelatedDocuments({ documentId }: { documentId: string }) {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<KhDocument[]>([]);

  useEffect(() => {
    khDocumentsAPI.related(documentId).then(setDocs).catch(() => {});
  }, [documentId]);

  if (!docs.length) return null;

  return (
    <div>
      <h3 className="text-xs font-medium text-app-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5" /> Related Documents
      </h3>
      <div className="space-y-1">
        {docs.map(doc => {
          const typeMeta = DOCUMENT_TYPE_META[doc.document_type];
          return (
            <button
              key={doc.id}
              onClick={() => navigate(`/knowledge-hub/documents/${doc.slug}`)}
              className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-sm text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
            >
              <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: typeMeta?.color }} />
              <span className="truncate">{doc.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

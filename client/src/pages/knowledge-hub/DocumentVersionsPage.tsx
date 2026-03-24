import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Clock } from 'lucide-react';
import { khVersionsAPI, khDocumentsAPI } from '@/lib/knowledge-hub/api';
import type { KhVersion, KhDocument } from '@/types/knowledge-hub';
import { toast } from 'sonner';

export function DocumentVersionsPage({ docId }: { docId: string }) {
  const navigate = useNavigate();
  const [doc, setDoc] = useState<KhDocument | null>(null);
  const [versions, setVersions] = useState<KhVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<KhVersion | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      khDocumentsAPI.getById(docId),
      khVersionsAPI.list(docId),
    ]).then(([d, v]) => {
      setDoc(d);
      setVersions(v);
    }).catch(console.error).finally(() => setLoading(false));
  }, [docId]);

  const handleRestore = async (version: KhVersion) => {
    if (!confirm(`Restore to version ${version.version_number}? This will overwrite the current content.`)) return;
    try {
      await khVersionsAPI.restore(docId, version.version_number);
      toast.success(`Restored to version ${version.version_number}`);
      navigate(`/knowledge-hub/documents/${docId}`);
    } catch {
      toast.error('Failed to restore version');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full text-app-muted">Loading...</div>;

  return (
    <div className="flex h-full min-h-0">
      <div className="w-80 border-r border-app-border bg-app-sidebar overflow-y-auto">
        <div className="p-4 border-b border-app-border">
          <button onClick={() => navigate(`/knowledge-hub/documents/${doc?.slug ?? docId}`)} className="flex items-center gap-1.5 text-sm text-app-muted hover:text-app-text mb-2 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to document
          </button>
          <h2 className="text-lg font-semibold text-app-text">{doc?.title}</h2>
          <p className="text-sm text-app-muted mt-0.5">{versions.length} versions</p>
        </div>

        <div className="p-2 space-y-1">
          {versions.map(v => (
            <button
              key={v.id}
              onClick={() => setSelectedVersion(v)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${selectedVersion?.id === v.id ? 'bg-primary-500/10 border border-primary-500/30' : 'hover:bg-app-hover'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-app-text">Version {v.version_number}</span>
                <button onClick={(e) => { e.stopPropagation(); handleRestore(v); }} className="p-1 rounded text-app-muted hover:text-primary-400 hover:bg-app-hover" title="Restore this version">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-xs text-app-muted">
                {v.author_name} · {new Date(v.created_at).toLocaleString()}
              </div>
              {v.change_note && <p className="text-xs text-app-muted mt-1 truncate">{v.change_note}</p>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-app-bg">
        {selectedVersion ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-app-text">Version {selectedVersion.version_number}</h3>
                <p className="text-sm text-app-muted">{selectedVersion.author_name} · {new Date(selectedVersion.created_at).toLocaleString()}</p>
              </div>
              <button onClick={() => handleRestore(selectedVersion)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-primary-500 text-app-text hover:bg-primary-600">
                <RotateCcw className="w-4 h-4" /> Restore
              </button>
            </div>
            {selectedVersion.change_note && (
              <p className="text-sm text-app-muted mb-4 p-3 rounded-lg bg-app-sidebar border border-app-border">{selectedVersion.change_note}</p>
            )}
            <div className="prose prose-invert max-w-none text-gray-300 whitespace-pre-wrap">
              {selectedVersion.plain_text || JSON.stringify(selectedVersion.content, null, 2)}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-app-muted">
            <Clock className="w-12 h-12 mb-3 text-gray-600" />
            <p>Select a version to preview</p>
          </div>
        )}
      </div>
    </div>
  );
}

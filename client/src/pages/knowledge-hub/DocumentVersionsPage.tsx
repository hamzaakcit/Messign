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

  if (loading) return <div className="flex items-center justify-center h-full text-gray-500">Loading...</div>;

  return (
    <div className="flex h-full min-h-0">
      <div className="w-80 border-r border-dark-700 bg-dark-800 overflow-y-auto">
        <div className="p-4 border-b border-dark-700">
          <button onClick={() => navigate(`/knowledge-hub/documents/${doc?.slug ?? docId}`)} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white mb-2 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to document
          </button>
          <h2 className="text-lg font-semibold text-white">{doc?.title}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{versions.length} versions</p>
        </div>

        <div className="p-2 space-y-1">
          {versions.map(v => (
            <button
              key={v.id}
              onClick={() => setSelectedVersion(v)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${selectedVersion?.id === v.id ? 'bg-primary-500/10 border border-primary-500/30' : 'hover:bg-dark-700'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">Version {v.version_number}</span>
                <button onClick={(e) => { e.stopPropagation(); handleRestore(v); }} className="p-1 rounded text-gray-500 hover:text-primary-400 hover:bg-dark-600" title="Restore this version">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-xs text-gray-500">
                {v.author_name} · {new Date(v.created_at).toLocaleString()}
              </div>
              {v.change_note && <p className="text-xs text-gray-400 mt-1 truncate">{v.change_note}</p>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-dark-900">
        {selectedVersion ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Version {selectedVersion.version_number}</h3>
                <p className="text-sm text-gray-500">{selectedVersion.author_name} · {new Date(selectedVersion.created_at).toLocaleString()}</p>
              </div>
              <button onClick={() => handleRestore(selectedVersion)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-primary-500 text-white hover:bg-primary-600">
                <RotateCcw className="w-4 h-4" /> Restore
              </button>
            </div>
            {selectedVersion.change_note && (
              <p className="text-sm text-gray-400 mb-4 p-3 rounded-lg bg-dark-800 border border-dark-700">{selectedVersion.change_note}</p>
            )}
            <div className="prose prose-invert max-w-none text-gray-300 whitespace-pre-wrap">
              {selectedVersion.plain_text || JSON.stringify(selectedVersion.content, null, 2)}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Clock className="w-12 h-12 mb-3 text-gray-600" />
            <p>Select a version to preview</p>
          </div>
        )}
      </div>
    </div>
  );
}

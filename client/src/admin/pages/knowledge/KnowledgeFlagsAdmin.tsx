import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { adminKnowledgeAPI } from '@/lib/api';
import { Button } from '@/components/ui';
import { toast } from 'sonner';
import { Flag, CheckCircle, XCircle, Eye, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FlagItem {
  id: string; document_id: string; document_title?: string;
  flagged_by: string; flagged_by_name?: string; reason: string;
  status: string; resolved_by_name?: string | null;
  resolved_note?: string | null; resolved_at?: string | null; created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-400',
  reviewed: 'bg-blue-500/20 text-blue-400',
  resolved: 'bg-emerald-500/20 text-emerald-400',
  dismissed: 'bg-gray-500/20 text-app-muted',
};

export function KnowledgeFlagsAdmin() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [flags, setFlags] = useState<FlagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');
  const [resolveModal, setResolveModal] = useState<{ flag: FlagItem; action: string } | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchFlags = async () => {
    setLoading(true);
    try {
      const data = await adminKnowledgeAPI.flags.list(userId, filter || undefined);
      setFlags(data as FlagItem[]);
    } catch { toast.error('Failed to load flags'); }
    setLoading(false);
  };

  useEffect(() => { fetchFlags(); }, [userId, filter]);

  const handleResolve = async () => {
    if (!resolveModal) return;
    setSaving(true);
    try {
      await adminKnowledgeAPI.flags.resolve(userId, resolveModal.flag.id, resolveModal.action, note);
      toast.success(`Flag ${resolveModal.action}`);
      setResolveModal(null);
      setNote('');
      fetchFlags();
    } catch { toast.error('Failed to update flag'); }
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-6 bg-app min-h-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-app">Knowledge Hub — Flags & Reports</h1>
        <div className="flex gap-2">
          {['', 'pending', 'reviewed', 'resolved', 'dismissed'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                filter === s ? 'bg-primary-500/20 text-primary-400 border-primary-500/30' : 'border-app-border text-app-muted hover:text-app')}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-app-muted">Loading...</div>
      ) : flags.length === 0 ? (
        <div className="rounded-xl border border-app-border bg-app-sidebar p-12 text-center text-app-muted">
          <Flag className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No flags found.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-app-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-app-card text-app-muted text-xs uppercase tracking-wider">
                <th className="text-left py-3 px-4">Document</th>
                <th className="text-left py-3 px-3">Flagged By</th>
                <th className="text-left py-3 px-3">Reason</th>
                <th className="text-left py-3 px-3">Status</th>
                <th className="text-left py-3 px-3 hidden md:table-cell">Date</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {flags.map(flag => (
                <tr key={flag.id} className="border-t border-app-border hover:bg-app-hover/50">
                  <td className="py-3 px-4 font-medium text-app">{flag.document_title ?? flag.document_id}</td>
                  <td className="py-3 px-3 text-app-muted text-xs">{flag.flagged_by_name ?? flag.flagged_by}</td>
                  <td className="py-3 px-3 text-app-muted text-xs max-w-xs truncate">{flag.reason}</td>
                  <td className="py-3 px-3">
                    <span className={cn('px-2 py-0.5 rounded text-xs font-medium uppercase', STATUS_COLORS[flag.status] ?? STATUS_COLORS.pending)}>
                      {flag.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-xs text-app-muted hidden md:table-cell">{new Date(flag.created_at).toLocaleDateString()}</td>
                  <td className="py-3 px-4 text-right">
                    {flag.status === 'pending' && (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setResolveModal({ flag, action: 'reviewed' }); setNote(''); }}
                          className="p-1.5 rounded text-app-muted hover:text-blue-400 hover:bg-app-hover" title="Mark Reviewed">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setResolveModal({ flag, action: 'resolved' }); setNote(''); }}
                          className="p-1.5 rounded text-app-muted hover:text-emerald-400 hover:bg-app-hover" title="Resolve">
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setResolveModal({ flag, action: 'dismissed' }); setNote(''); }}
                          className="p-1.5 rounded text-app-muted hover:text-app-muted hover:bg-app-hover" title="Dismiss">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {flag.status !== 'pending' && flag.resolved_note && (
                      <span className="text-xs text-app-muted" title={flag.resolved_note}>Note: {flag.resolved_note.slice(0, 30)}...</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Resolve Modal */}
      {resolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setResolveModal(null)}>
          <div className="rounded-xl border border-app-border bg-app-sidebar w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-app-border flex items-center justify-between">
              <h3 className="font-bold text-app capitalize">{resolveModal.action} Flag</h3>
              <button onClick={() => setResolveModal(null)} className="text-app-muted hover:text-app"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6">
              <p className="text-sm text-app-muted mb-3">Flag on: <span className="font-medium text-app">{resolveModal.flag.document_title}</span></p>
              <p className="text-sm text-app-muted mb-4">Reason: {resolveModal.flag.reason}</p>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Resolution note (optional)..."
                className="w-full h-20 px-3 py-2 rounded-lg border border-app-border bg-app-card text-app text-sm resize-none focus:outline-none focus:border-primary-500" />
            </div>
            <div className="px-6 py-4 border-t border-app-border flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setResolveModal(null)}>Cancel</Button>
              <Button onClick={handleResolve} disabled={saving}>{saving ? 'Saving...' : 'Confirm'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

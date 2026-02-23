import { useState } from 'react';
import { Send, Check, X, RotateCcw, Archive, MessageSquare } from 'lucide-react';
import { khWorkflowAPI } from '@/lib/knowledge-hub/api';
import type { KhDocument } from '@/types/knowledge-hub';
import { STATUS_META } from '@/types/knowledge-hub';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  doc: KhDocument;
  onStatusChange: (updated: KhDocument) => void;
}

export function WorkflowStatusBar({ doc, onStatusChange }: Props) {
  const { user } = useAuthStore();
  const [actionComment, setActionComment] = useState('');
  const [showCommentInput, setShowCommentInput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isAuthor = user?.id === doc.author_id;
  const statusMeta = STATUS_META[doc.status];

  const actions: { key: string; label: string; icon: React.ElementType; color: string; needsComment: boolean; check: () => boolean }[] = [
    { key: 'submit', label: 'Submit for Review', icon: Send, color: 'bg-blue-500', needsComment: false, check: () => doc.status === 'draft' && isAuthor },
    { key: 'approve', label: 'Approve', icon: Check, color: 'bg-green-500', needsComment: false, check: () => doc.status === 'in_review' && !isAuthor },
    { key: 'reject', label: 'Reject', icon: X, color: 'bg-red-500', needsComment: true, check: () => doc.status === 'in_review' && !isAuthor },
    { key: 'changes', label: 'Request Changes', icon: MessageSquare, color: 'bg-yellow-500', needsComment: true, check: () => doc.status === 'in_review' && !isAuthor },
    { key: 'archive', label: 'Archive', icon: Archive, color: 'bg-gray-500', needsComment: false, check: () => doc.status === 'published' && isAuthor },
    { key: 'restore', label: 'Restore to Draft', icon: RotateCcw, color: 'bg-blue-500', needsComment: false, check: () => (doc.status === 'archived' || doc.status === 'rejected') && isAuthor },
  ];

  const handleAction = async (key: string) => {
    setLoading(true);
    try {
      let updated: KhDocument;
      switch (key) {
        case 'submit': updated = await khWorkflowAPI.submitReview(doc.id); break;
        case 'approve': updated = await khWorkflowAPI.approve(doc.id, actionComment); break;
        case 'reject': updated = await khWorkflowAPI.reject(doc.id, actionComment); break;
        case 'changes': updated = await khWorkflowAPI.requestChanges(doc.id, actionComment); break;
        case 'archive': updated = await khWorkflowAPI.archive(doc.id); break;
        case 'restore': updated = await khWorkflowAPI.restore(doc.id); break;
        default: return;
      }
      toast.success('Status updated');
      onStatusChange(updated);
      setShowCommentInput(null);
      setActionComment('');
    } catch (e) {
      toast.error('Action failed');
    } finally {
      setLoading(false);
    }
  };

  const availableActions = actions.filter(a => a.check());
  if (!availableActions.length) return null;

  return (
    <div className="mb-4 p-3 rounded-xl bg-dark-800 border border-dark-700">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: statusMeta?.color + '20', color: statusMeta?.color }}>
            {statusMeta?.label}
          </span>
          <span className="text-xs text-gray-500">Workflow Actions:</span>
        </div>
        <div className="flex items-center gap-2">
          {availableActions.map(action => (
            <div key={action.key}>
              {showCommentInput === action.key ? (
                <div className="flex items-center gap-2">
                  <input value={actionComment} onChange={(e) => setActionComment(e.target.value)} placeholder="Add a comment..." className="px-2 py-1 rounded text-xs bg-dark-700 text-white border border-dark-600 w-48" autoFocus />
                  <button onClick={() => handleAction(action.key)} disabled={loading || !actionComment.trim()} className={cn('px-2 py-1 rounded text-xs text-white', action.color, 'disabled:opacity-50')}>
                    Confirm
                  </button>
                  <button onClick={() => setShowCommentInput(null)} className="text-xs text-gray-500 hover:text-white">Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => action.needsComment ? setShowCommentInput(action.key) : handleAction(action.key)}
                  disabled={loading}
                  className={cn('flex items-center gap-1 px-2.5 py-1 rounded text-xs text-white transition-opacity disabled:opacity-50', action.color, 'hover:opacity-90')}
                >
                  <action.icon className="w-3 h-3" /> {action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

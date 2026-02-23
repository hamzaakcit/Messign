import { useState } from 'react';
import { X, Send, CheckCircle, MessageSquare } from 'lucide-react';
import { khCommentsAPI } from '@/lib/knowledge-hub/api';
import type { KhComment } from '@/types/knowledge-hub';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

interface Props {
  documentId: string;
  comments: KhComment[];
  onClose: () => void;
  onCommentsChange: (comments: KhComment[]) => void;
}

export function InlineCommentThread({ documentId, comments, onClose, onCommentsChange }: Props) {
  useAuthStore(); // auth available for future use
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    try {
      await khCommentsAPI.create({ documentId, content: newComment });
      const refreshed = await khCommentsAPI.list(documentId);
      onCommentsChange(refreshed);
      setNewComment('');
    } catch (e) { console.error(e); }
  };

  const handleReply = async (parentId: string) => {
    if (!replyText.trim()) return;
    try {
      await khCommentsAPI.create({ documentId, content: replyText, parentId });
      const refreshed = await khCommentsAPI.list(documentId);
      onCommentsChange(refreshed);
      setReplyTo(null);
      setReplyText('');
    } catch (e) { console.error(e); }
  };

  const handleResolve = async (id: string) => {
    try {
      await khCommentsAPI.resolve(id);
      const refreshed = await khCommentsAPI.list(documentId);
      onCommentsChange(refreshed);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="w-80 border-l border-dark-700 bg-dark-800 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-dark-700">
        <h3 className="text-sm font-medium text-white flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> Comments ({comments.length})
        </h3>
        <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-white hover:bg-dark-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {comments.map(comment => (
          <div key={comment.id} className={cn('rounded-lg p-3', comment.is_resolved ? 'bg-dark-700/50 opacity-60' : 'bg-dark-700')}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-300">{comment.author_name ?? comment.author_id}</span>
              {!comment.is_resolved && (
                <button onClick={() => handleResolve(comment.id)} className="p-0.5 rounded text-gray-500 hover:text-green-400" title="Resolve">
                  <CheckCircle className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {comment.selected_text && (
              <div className="text-xs text-yellow-400/70 bg-yellow-400/5 px-2 py-1 rounded mb-1.5 italic">"{comment.selected_text}"</div>
            )}
            <p className="text-sm text-gray-300">{comment.content}</p>
            <span className="text-xs text-gray-500 mt-1 block">{new Date(comment.created_at).toLocaleDateString()}</span>

            {/* Replies */}
            {comment.replies && comment.replies.length > 0 && (
              <div className="mt-2 pl-3 border-l border-dark-600 space-y-2">
                {comment.replies.map(reply => (
                  <div key={reply.id} className="text-xs">
                    <span className="font-medium text-gray-400">{reply.author_name ?? reply.author_id}</span>
                    <p className="text-gray-400 mt-0.5">{reply.content}</p>
                  </div>
                ))}
              </div>
            )}

            {replyTo === comment.id ? (
              <div className="mt-2 flex gap-1">
                <input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Reply..." className="flex-1 px-2 py-1 rounded text-xs bg-dark-600 text-white border border-dark-500" onKeyDown={(e) => e.key === 'Enter' && handleReply(comment.id)} autoFocus />
                <button onClick={() => handleReply(comment.id)} className="p-1 rounded bg-primary-500 text-white"><Send className="w-3 h-3" /></button>
              </div>
            ) : (
              <button onClick={() => setReplyTo(comment.id)} className="text-xs text-primary-400 hover:text-primary-300 mt-1">Reply</button>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-dark-700 p-3">
        <div className="flex gap-2">
          <input
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="flex-1 px-3 py-2 rounded-lg bg-dark-700 border border-dark-600 text-sm text-white placeholder-gray-500"
            onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
          />
          <button onClick={handleAddComment} disabled={!newComment.trim()} className="p-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

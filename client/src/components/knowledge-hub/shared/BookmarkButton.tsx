import { useState } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { khBookmarksAPI } from '@/lib/knowledge-hub/api';
import { cn } from '@/lib/utils';

interface Props {
  documentId: string;
  isBookmarked?: boolean;
  className?: string;
}

export function BookmarkButton({ documentId, isBookmarked: initialBookmarked, className }: Props) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked ?? false);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await khBookmarksAPI.toggle(documentId);
      setBookmarked(result.bookmarked);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={cn(
        'p-1.5 rounded-lg transition-colors',
        bookmarked ? 'text-yellow-400 hover:text-yellow-300' : 'text-gray-400 hover:text-yellow-400',
        className
      )}
      title={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
    >
      {bookmarked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
    </button>
  );
}

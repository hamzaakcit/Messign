import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import type { AISourceDocument } from '@/types/knowledge-hub/ai';

interface AISourcesListProps {
  sources: AISourceDocument[];
}

export function AISourcesList({ sources }: AISourcesListProps) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 pt-2 border-t border-app-border">
      <p className="text-xs font-medium dora-chat-text-tertiary mb-1.5">
        Sources ({sources.length}):
      </p>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <Link
            key={source.id}
            to={`/knowledge-hub/documents/${source.slug ?? source.id}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md
              bg-app-card/50 text-primary-400 text-xs font-medium
              hover:bg-app-hover hover:text-primary-300
              transition-colors border border-app-border"
          >
            <FileText size={11} className="flex-shrink-0" />
            <span className="truncate max-w-[180px]">{source.title}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

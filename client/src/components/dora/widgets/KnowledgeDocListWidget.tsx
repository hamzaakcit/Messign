import { BookOpen, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface KnowledgeDocRow {
  id?: string;
  title: string;
  slug?: string;
  document_type?: string;
}

/**
 * Compact doc cards for knowledge search tool results (real IDs/slugs from the server).
 */
export default function KnowledgeDocListWidget({
  data,
  title = 'Matching documents',
  delay = 0,
}: {
  data: unknown;
  title?: string;
  delay?: number;
}): JSX.Element {
  const raw = data as { documents?: unknown } | KnowledgeDocRow[] | undefined;
  const list: KnowledgeDocRow[] = Array.isArray(raw)
    ? (raw as KnowledgeDocRow[])
    : Array.isArray(raw?.documents)
      ? (raw!.documents as KnowledgeDocRow[])
      : [];

  return (
    <div
      className="dora-glass mt-3 border border-app-border/80 overflow-hidden"
      style={{
        borderRadius: 'var(--dora-r-widget, 16px)',
        animationDelay: `${delay}s`,
      }}
    >
      <div className="px-3 py-2 border-b border-app-border/60 flex items-center gap-2 text-xs font-semibold text-app-text">
        <BookOpen className="w-3.5 h-3.5 text-sky-400" />
        {title}
      </div>
      <ul className="divide-y divide-app-border/40 max-h-72 overflow-y-auto">
        {list.map((doc) => {
          const href = `/knowledge-hub/documents/${doc.slug ?? doc.id ?? ''}`;
          return (
            <li key={String(doc.id ?? doc.slug ?? doc.title)} className="px-3 py-2 hover:bg-app-sidebar/50">
              <Link
                to={href}
                className="flex items-start gap-2 text-sm text-sky-400 hover:text-sky-300 group"
              >
                <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0 opacity-70 group-hover:opacity-100" />
                <span className="min-w-0">
                  <span className="text-app-text group-hover:text-sky-300 line-clamp-2">{doc.title}</span>
                  {doc.document_type ? (
                    <span className="block text-[10px] text-app-muted mt-0.5">{doc.document_type}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {list.length === 0 ? (
        <p className="px-3 py-4 text-xs text-app-muted">No documents in this result set.</p>
      ) : null}
    </div>
  );
}

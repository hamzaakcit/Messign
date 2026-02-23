import { Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Backlink {
  id: string;
  title: string;
  slug: string;
}

export function BacklinksList({ backlinks }: { backlinks: Backlink[] }) {
  const navigate = useNavigate();

  if (!backlinks.length) return null;

  return (
    <div>
      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <Link2 className="w-3.5 h-3.5" /> Backlinks ({backlinks.length})
      </h3>
      <div className="space-y-1">
        {backlinks.map(bl => (
          <button
            key={bl.id}
            onClick={() => navigate(`/knowledge-hub/documents/${bl.slug}`)}
            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-sm text-gray-400 hover:text-white hover:bg-dark-700 transition-colors"
          >
            <Link2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{bl.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

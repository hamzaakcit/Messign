import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import type { CommandCenterBrain, CommandCenterDeepDiveKind } from '@/types/command-center';
import { BentoCard } from './BentoCard';

interface KnowledgeModuleProps {
  brain: CommandCenterBrain;
  onOpenDeepDive: (kind: CommandCenterDeepDiveKind) => void;
}

/**
 * Recent Knowledge Hub documents (pinned list not in DTO — see product backlog).
 */
export function KnowledgeModule({ brain, onOpenDeepDive }: KnowledgeModuleProps): JSX.Element {
  const recent = brain.knowledgeRecent.slice(0, 5);

  return (
    <BentoCard title="Knowledge · recent">
      <ul className="space-y-0.5 min-h-0">
        {recent.length === 0 ? (
          <li className="text-[10px] text-app-muted py-1">No recent docs.</li>
        ) : (
          recent.map((d) => (
            <li key={d.id}>
              <Link
                to={`/knowledge-hub/documents/${d.slug || d.id}`}
                className="flex items-start gap-1 rounded-md px-1 py-0.5 hover:bg-white/[0.04] min-w-0"
                title={d.title}
              >
                <BookOpen className="w-3 h-3 text-emerald-400/90 shrink-0 mt-0.5" aria-hidden />
                <span className="text-[10px] text-app-text truncate">{d.title}</span>
              </Link>
            </li>
          ))
        )}
      </ul>
      <button
        type="button"
        onClick={() => onOpenDeepDive({ kind: 'brain_knowledge' })}
        className="mt-1 w-full text-[9px] font-medium text-primary-400 hover:text-primary-300 pt-1 border-t border-white/[0.06]"
      >
        View all in slide-over →
      </button>
    </BentoCard>
  );
}

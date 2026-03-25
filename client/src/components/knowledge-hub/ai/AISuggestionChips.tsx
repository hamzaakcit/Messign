import type { ElementType } from 'react';
import {
  TrendingUp,
  FolderKanban,
  CheckSquare,
  Users,
  Trophy,
  DollarSign,
  ClipboardCheck,
  BookOpen,
  BarChart3,
  Zap,
  HelpCircle,
  Target,
  LineChart,
  Briefcase,
  Headphones,
  Clock,
  CircleDot,
  Package,
  FileWarning,
  Heart,
  PieChart,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  FileText,
  Scale,
  PlusCircle,
  AlertCircle,
  Send,
  Activity,
  Sparkles,
  Megaphone,
  Flame,
  UserPlus,
  Star,
  AlertTriangle,
  Cpu,
  ListOrdered,
} from 'lucide-react';
import type { IntentCategory } from '@/shared/intents/registry';
import { getSuggestions } from '@/shared/intents/suggestion-engine';
import type { Surface } from '@/shared/intents/registry';
import { useDoraSessionStore } from '@/stores/doraSessionStore';

export const INTENT_ICON_MAP: Record<string, ElementType> = {
  TrendingUp,
  FolderKanban,
  CheckSquare,
  Users,
  Trophy,
  DollarSign,
  ClipboardCheck,
  BookOpen,
  BarChart3,
  Zap,
  HelpCircle,
  Target,
  LineChart,
  Briefcase,
  Headphones,
  Clock,
  CircleDot,
  Package,
  FileWarning,
  Heart,
  PieChart,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  FileText,
  Scale,
  PlusCircle,
  AlertCircle,
  Send,
  Activity,
  Sparkles,
  Megaphone,
  Flame,
  UserPlus,
  Star,
  AlertTriangle,
  Cpu,
  ListOrdered,
};

const CATEGORY_BORDER: Record<IntentCategory, string> = {
  quick: 'border-l-sky-500/70',
  dashboard: 'border-l-cyan-500/70',
  performance: 'border-l-amber-500/70',
  projects: 'border-l-violet-500/70',
  finance: 'border-l-emerald-500/70',
  knowledge: 'border-l-blue-500/70',
  crm: 'border-l-indigo-500/70',
  marketing: 'border-l-pink-500/70',
  recruitment: 'border-l-teal-500/70',
  support: 'border-l-green-500/70',
  okr: 'border-l-orange-500/70',
  assets: 'border-l-lime-500/70',
  contracts: 'border-l-stone-500/70',
  culture: 'border-l-rose-500/70',
  hr: 'border-l-purple-500/70',
  admin: 'border-l-red-500/60',
  reports: 'border-l-fuchsia-500/70',
};

interface AISuggestionChipsProps {
  userRole: string;
  onSuggestionClick: (query: string, intentId?: string) => void;
  conversationActive?: boolean;
  surface?: Surface;
  currentPath?: string;
  lastIntentId?: string;
  recentIntentIds?: string[];
}

export function AISuggestionChips({
  userRole,
  onSuggestionClick,
  conversationActive = false,
  surface = 'dora',
  currentPath,
  lastIntentId,
  recentIntentIds: recentIntentIdsProp,
}: AISuggestionChipsProps) {
  const path = currentPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/');

  const storeRecent = useDoraSessionStore((s) => s.recentIntents);
  const frequentCategories = useDoraSessionStore((s) => s.frequentCategories);
  const visitedModulePrefixes = useDoraSessionStore((s) => s.visitedModulePrefixes);
  const recentIntentIds = recentIntentIdsProp ?? storeRecent;

  if (conversationActive && surface !== 'followup') {
    return null;
  }

  const suggestions = getSuggestions({
    role: userRole,
    currentPath: path,
    surface,
    lastIntentId,
    recentIntents: recentIntentIds,
    frequentCategories,
    visitedModulePrefixes,
    conversationActive,
  });

  if (suggestions.length === 0) return null;

  const isScrollRow = surface === 'dora' || surface === 'knowledge-hub';

  return (
    <div
      className={
        isScrollRow
          ? 'flex flex-nowrap gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-dark-600'
          : 'flex flex-wrap gap-2'
      }
    >
      {suggestions.map((suggestion, i) => {
        const IconComponent = suggestion.icon ? INTENT_ICON_MAP[suggestion.icon] : null;
        const borderClass = CATEGORY_BORDER[suggestion.category] ?? 'border-l-white/20';
        return (
          <button
            key={suggestion.id}
            type="button"
            title={suggestion.query}
            onClick={() => onSuggestionClick(suggestion.query, suggestion.id)}
            style={{
              animation: 'dora-chip-in 0.4s ease-out forwards',
              animationDelay: `${i * 50}ms`,
              opacity: 0,
            }}
            className={`group inline-flex items-center gap-1.5 shrink-0 px-4 py-2 rounded-full
              bg-app-sidebar border border-app-border border-l-2 ${borderClass} text-sm text-app-muted
              hover:border-primary-500/50 hover:bg-app-hover/80 hover:scale-[1.02]
              hover:text-app-text transition-all duration-200 cursor-pointer`}
          >
            {IconComponent && (
              <IconComponent
                size={14}
                className="dora-chat-text-tertiary group-hover:text-primary-400 transition-colors shrink-0"
              />
            )}
            <span className="whitespace-nowrap">{suggestion.label}</span>
          </button>
        );
      })}
      <style>{`
        @keyframes dora-chip-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

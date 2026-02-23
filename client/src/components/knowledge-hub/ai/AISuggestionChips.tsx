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
} from 'lucide-react';
import type { AISuggestion } from '@/types/knowledge-hub/ai';

const ICON_MAP: Record<string, React.ElementType> = {
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
};

const COMMON_SUGGESTIONS: AISuggestion[] = [
  { label: 'What can I ask?', query: 'What questions can I ask the AI?', icon: 'HelpCircle', category: 'quick' },
  { label: 'What are my open tasks?', query: 'What are my open tasks?', icon: 'CheckSquare', category: 'quick' },
  { label: 'My performance this month', query: 'Show me my performance this month', icon: 'TrendingUp', category: 'performance' },
];

const EMPLOYEE_SUGGESTIONS: AISuggestion[] = [
  ...COMMON_SUGGESTIONS,
  { label: 'Available bounties', query: 'What bounties are available?', icon: 'Zap', category: 'quick' },
  { label: 'My badges & achievements', query: 'What badges have I earned?', icon: 'Trophy', category: 'quick' },
  { label: 'My reimbursements', query: 'Show me my pending reimbursements', icon: 'DollarSign', category: 'finance' },
  { label: 'Find a guide', query: 'Search the knowledge base for onboarding guide', icon: 'BookOpen', category: 'knowledge' },
];

const MANAGER_SUGGESTIONS: AISuggestion[] = [
  ...COMMON_SUGGESTIONS,
  { label: 'Team performance', query: "Show me my team's performance this month", icon: 'Users', category: 'performance' },
  { label: 'Project statuses', query: 'What is the status of all active projects?', icon: 'FolderKanban', category: 'projects' },
  { label: 'Pending approvals', query: 'What needs my approval?', icon: 'ClipboardCheck', category: 'quick' },
  { label: "Who's top performer?", query: 'Who are the top performers this quarter?', icon: 'Trophy', category: 'performance' },
  { label: 'Sprint progress', query: 'What is the current sprint status?', icon: 'Zap', category: 'projects' },
  { label: 'Team comparison', query: 'How do all teams compare this month?', icon: 'BarChart3', category: 'performance' },
];

const ADMIN_SUGGESTIONS: AISuggestion[] = [
  ...COMMON_SUGGESTIONS,
  { label: 'System overview', query: 'Give me a system-wide overview', icon: 'BarChart3', category: 'quick' },
  { label: 'Executive report', query: 'Generate an executive summary for this quarter', icon: 'BarChart3', category: 'performance' },
  { label: 'Financial summary', query: 'What is the company-wide financial summary this month?', icon: 'DollarSign', category: 'finance' },
  { label: 'All team metrics', query: "Show me all teams' performance comparison", icon: 'Users', category: 'performance' },
  { label: 'Pending approvals', query: 'What items need approval across the system?', icon: 'ClipboardCheck', category: 'quick' },
  { label: 'Knowledge health', query: 'How many documents are in the knowledge base? How many are stale?', icon: 'BookOpen', category: 'knowledge' },
];

const TOPLEVEL_EXTRA_SUGGESTIONS: AISuggestion[] = [
  { label: "What's our revenue this quarter?", query: "What's our revenue this quarter?", icon: 'DollarSign', category: 'finance' },
  { label: 'Show dashboard metrics', query: 'Show me the dashboard metrics', icon: 'BarChart3', category: 'quick' },
  { label: 'Active projects overview', query: 'Give me an overview of all active projects', icon: 'FolderKanban', category: 'projects' },
  { label: 'Team leaderboard', query: 'Show me the MP leaderboard', icon: 'Trophy', category: 'performance' },
];

interface AISuggestionChipsProps {
  userRole: string;
  onSuggestionClick: (query: string) => void;
  compact?: boolean;
  isTopLevel?: boolean;
}

export function AISuggestionChips({ userRole, onSuggestionClick, compact = false, isTopLevel = false }: AISuggestionChipsProps) {
  let suggestions: AISuggestion[];
  if (userRole === 'admin') {
    suggestions = ADMIN_SUGGESTIONS;
  } else if (['manager', 'cpo', 'hr'].includes(userRole)) {
    suggestions = MANAGER_SUGGESTIONS;
  } else {
    suggestions = EMPLOYEE_SUGGESTIONS;
  }

  if (isTopLevel) {
    const existingQueries = new Set(suggestions.map((s) => s.query));
    const extras = TOPLEVEL_EXTRA_SUGGESTIONS.filter((s) => !existingQueries.has(s.query));
    suggestions = [...suggestions, ...extras];
  }

  if (compact) suggestions = suggestions.slice(0, 4);

  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((suggestion, i) => {
        const IconComponent = suggestion.icon ? ICON_MAP[suggestion.icon] : null;
        return (
          <button
            key={i}
            onClick={() => onSuggestionClick(suggestion.query)}
            className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
              bg-dark-800 border border-dark-700 text-sm text-gray-300
              hover:border-primary-500/40 hover:bg-dark-800/80
              hover:text-white transition-all duration-150 cursor-pointer"
          >
            {IconComponent && (
              <IconComponent
                size={14}
                className="text-gray-500 group-hover:text-primary-400 transition-colors"
              />
            )}
            <span>{suggestion.label}</span>
          </button>
        );
      })}
    </div>
  );
}

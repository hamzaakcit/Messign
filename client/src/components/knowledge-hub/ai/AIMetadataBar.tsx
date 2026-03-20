import {
  Database,
  Clock,
  BarChart3,
  BookOpen,
  TrendingUp,
  FolderKanban,
  CheckSquare,
  Users,
  Zap,
  DollarSign,
  Receipt,
  FileText,
  Trophy,
  Target,
  Activity,
  User,
  MessageSquare,
  Star,
  ClipboardCheck,
  Calendar,
  GitCompare,
  PieChart,
} from 'lucide-react';
import type { AIResponseMetadata } from '@/types/knowledge-hub/ai';
import { TOOL_DISPLAY_MAP } from '@/types/knowledge-hub/ai';

const ICON_MAP: Record<string, React.ElementType> = {
  BookOpen,
  TrendingUp,
  FolderKanban,
  CheckSquare,
  Users,
  Zap,
  DollarSign,
  Receipt,
  FileText,
  Trophy,
  Target,
  Activity,
  User,
  MessageSquare,
  Star,
  ClipboardCheck,
  BarChart3,
  Calendar,
  GitCompare,
  PieChart,
  Database,
};

interface AIMetadataBarProps {
  metadata: AIResponseMetadata;
}

export function AIMetadataBar({ metadata }: AIMetadataBarProps) {
  if (!metadata || metadata.toolsUsed.length === 0) return null;

  const toolChips = metadata.toolsUsed.map((toolName) => {
    const display = TOOL_DISPLAY_MAP[toolName] ?? {
      label: toolName.replace(/^get_/, '').replace(/_/g, ' '),
      icon: 'Database',
      color: 'text-gray-400',
    };
    const IconComponent = ICON_MAP[display.icon] ?? Database;

    return (
      <span
        key={toolName}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-dark-700 text-xs font-medium text-gray-400"
        title={`Tool: ${toolName}`}
      >
        <IconComponent size={12} className={display.color} />
        {display.label}
      </span>
    );
  });

  const responseTime = metadata.responseTimeMs
    ? metadata.responseTimeMs < 1000
      ? `${metadata.responseTimeMs}ms`
      : `${(metadata.responseTimeMs / 1000).toFixed(1)}s`
    : null;

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-dark-600">
      <div className="flex flex-wrap items-center gap-1.5">
        <Database size={12} className="dora-chat-text-tertiary flex-shrink-0" />
        {toolChips}
      </div>

      <div className="flex items-center gap-3 ml-auto text-xs dora-chat-text-tertiary">
        {metadata.dataPoints > 0 && (
          <span className="flex items-center gap-1">
            <BarChart3 size={11} />
            {metadata.dataPoints} data points
          </span>
        )}
        {responseTime && (
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {responseTime}
          </span>
        )}
      </div>
    </div>
  );
}

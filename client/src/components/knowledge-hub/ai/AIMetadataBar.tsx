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
import { getToolChipDisplay } from '@/types/knowledge-hub/ai';

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

  const counts = new Map<string, number>();
  for (const name of metadata.toolsUsed) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const toolRows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const responseTime = metadata.responseTimeMs
    ? metadata.responseTimeMs < 1000
      ? `${metadata.responseTimeMs}ms`
      : `${(metadata.responseTimeMs / 1000).toFixed(1)}s`
    : null;

  return (
    <div className="mt-2 pt-2 border-t border-app-border space-y-2">
      <div className="overflow-x-auto rounded-lg border border-app-border/70 bg-app-sidebar/40">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-app-sidebar/80">
              <th className="text-left font-medium text-app-muted px-2 py-1 border-b border-app-border/60">
                Step
              </th>
              <th className="text-right font-medium text-app-muted px-2 py-1 w-14 border-b border-app-border/60">
                ×
              </th>
            </tr>
          </thead>
          <tbody>
            {toolRows.map(([toolName, n]) => {
              const display = getToolChipDisplay(toolName);
              const IconComponent = ICON_MAP[display.icon] ?? Database;
              return (
                <tr key={toolName} className="border-b border-app-border/35 last:border-0">
                  <td className="px-2 py-1 align-middle">
                    <span className="inline-flex items-center gap-1.5 text-app-muted" title={toolName}>
                      <IconComponent size={12} className={display.color} />
                      <span className="font-medium">{display.label}</span>
                    </span>
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums text-app-muted">{n}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 text-xs dora-chat-text-tertiary">
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

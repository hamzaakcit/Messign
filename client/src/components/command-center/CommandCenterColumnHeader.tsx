import { DoraColumnInsightBadge } from './DoraColumnInsightBadge';

interface CommandCenterColumnHeaderProps {
  title: string;
  insight: string;
  icon?: React.ReactNode;
}

export function CommandCenterColumnHeader({ title, insight, icon }: CommandCenterColumnHeaderProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 mb-1">
      <div className="flex items-center gap-1.5 min-w-0">
        {icon}
        <h2 className="text-xs font-bold uppercase tracking-wider text-app-text truncate">{title}</h2>
      </div>
      <DoraColumnInsightBadge message={insight} className="shrink-0" />
    </div>
  );
}

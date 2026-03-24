import {
  Linkedin,
  Mail,
  Hash,
  FileText,
  Target,
  BarChart3,
} from 'lucide-react';
import type { MarketingComposerIconKey } from './marketingDoraQuickActions';

interface MarketingDoraQuickActionIconProps {
  icon: MarketingComposerIconKey;
  size?: 'sm' | 'md';
}

export function MarketingDoraQuickActionIcon({
  icon,
  size = 'md',
}: MarketingDoraQuickActionIconProps): JSX.Element {
  const cn = size === 'sm' ? 'w-2.5 h-2.5 shrink-0' : 'w-4 h-4 shrink-0';
  switch (icon) {
    case 'linkedin':
      return <Linkedin className={`${cn} text-blue-300`} />;
    case 'mail':
      return <Mail className={`${cn} text-emerald-300`} />;
    case 'x':
      return <Hash className={`${cn} text-slate-200`} />;
    case 'blog':
      return <FileText className={`${cn} text-violet-300`} />;
    case 'ads':
      return <Target className={`${cn} text-amber-300`} />;
    case 'metrics':
      return <BarChart3 className={`${cn} text-cyan-300`} />;
  }
}

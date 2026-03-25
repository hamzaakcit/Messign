import { Heart } from 'lucide-react';
import type { ExecutiveDashboard } from '@/lib/executiveApi';
import { DepartmentCard } from '../DepartmentCard';

interface CultureCardProps {
  data: ExecutiveDashboard['culture'];
  onAction: () => void;
}

export function CultureCard({ data, onAction }: CultureCardProps): JSX.Element {
  const trendLabel = data?.engagementTrend === 'improving' ? 'Improving'
    : data?.engagementTrend === 'declining' ? 'Declining' : 'Stable';

  return (
    <DepartmentCard
      id="culture"
      title="Culture / Heart"
      icon={<Heart className="w-4 h-4" />}
      iconColor="#f43f5e"
      metrics={[
        { label: 'Health Score', value: data?.healthScore.toFixed(0) ?? 'N/A' },
        { label: 'Sentiment', value: data?.sentimentAvg.toFixed(1) ?? 'N/A' },
        { label: 'Trend', value: trendLabel },
      ]}
      actionLabel="View Pulse"
      onAction={onAction}
    />
  );
}

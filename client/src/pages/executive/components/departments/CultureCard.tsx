import { Heart } from 'lucide-react';
import type { ExecutiveDashboard } from '@/lib/executiveApi';
import { DepartmentCard } from '../DepartmentCard';

interface CultureCardProps {
  data: ExecutiveDashboard['culture'];
  onAction: () => void;
}

function formatHealth(data: ExecutiveDashboard['culture']): string {
  if (data == null || data.healthScore == null) return 'N/A';
  return data.healthScore.toFixed(0);
}

function formatSentiment(data: ExecutiveDashboard['culture']): string {
  if (data == null || data.sentimentAvg == null) return 'N/A';
  return data.sentimentAvg.toFixed(1);
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
        { label: 'Health Score', value: formatHealth(data) },
        { label: 'Sentiment', value: formatSentiment(data) },
        { label: 'Trend', value: trendLabel },
      ]}
      actionLabel="View Pulse"
      onAction={onAction}
    />
  );
}

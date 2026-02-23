import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { Lightbulb } from 'lucide-react';

interface RightSidebarInsightsProps {
  totalEmployees: number;
  lowLevelCount?: number;
}

export function RightSidebarInsights({ totalEmployees, lowLevelCount = 0 }: RightSidebarInsightsProps) {
  const insights: { text: string; action?: string }[] = [];
  if (lowLevelCount > 0) {
    insights.push({
      text: `${lowLevelCount} employee(s) at level 1–3. Consider sending encouragement.`,
      action: 'Send message',
    });
  }
  insights.push({
    text: 'MP multiplier at 1.2x could improve engagement.',
    action: 'Apply in settings',
  });
  if (totalEmployees > 0) {
    insights.push({
      text: '"Task Master" badge is popular. Consider adding "Super Task Master".',
      action: 'Create badge',
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          Smart insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {insights.slice(0, 3).map((item, i) => (
            <li key={i} className="text-sm text-gray-400 flex flex-col gap-1">
              <span>{item.text}</span>
              {item.action && (
                <button type="button" className="text-primary-400 hover:text-primary-300 text-xs text-left w-fit">
                  {item.action}
                </button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

import { ViewportContainer } from '@/components/layout/ViewportContainer';
import { MarketingHub } from './MarketingHub';

export function MarketingLayout() {
  return (
    <ViewportContainer density="compact" className="min-h-0 flex-1 bg-app">
      <MarketingHub />
    </ViewportContainer>
  );
}

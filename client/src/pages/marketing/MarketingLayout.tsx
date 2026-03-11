import { useLocation } from 'react-router-dom';
import { MarketingCampaignsPage } from './MarketingCampaignsPage';
import { MarketingContentPage } from './MarketingContentPage';
import { MarketingLeadsPage } from './MarketingLeadsPage';
import { MarketingDashboardPage } from './MarketingDashboardPage';
import { MarketingEmailPage } from './MarketingEmailPage';

export function MarketingLayout() {
  const location = useLocation();
  const segment = location.pathname.split('/').filter(Boolean)[1];

  switch (segment) {
    case 'content':
      return <MarketingContentPage />;
    case 'leads':
      return <MarketingLeadsPage />;
    case 'email':
      return <MarketingEmailPage />;
    case 'dashboard':
      return <MarketingDashboardPage />;
    default:
      return <MarketingCampaignsPage />;
  }
}

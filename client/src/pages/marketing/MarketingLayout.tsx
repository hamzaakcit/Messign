import { useLocation } from 'react-router-dom';
import { MarketingCampaignsPage } from './MarketingCampaignsPage';
import { MarketingContentPage } from './MarketingContentPage';
import { MarketingLeadsPage } from './MarketingLeadsPage';
import { MarketingDashboardPage } from './MarketingDashboardPage';
import { MarketingEmailPage } from './MarketingEmailPage';
import { MarketingAgentPage } from './MarketingAgentPage';
import { MarketingApprovalQueuePage } from './MarketingApprovalQueuePage';
import { MarketingCommandCenterPage } from './MarketingCommandCenterPage';

export function MarketingLayout() {
  const location = useLocation();
  const segment = location.pathname.split('/').filter(Boolean)[1];

  switch (segment) {
    case undefined:
    case 'command-center':
      return <MarketingCommandCenterPage />;
    case 'campaigns':
      return <MarketingCampaignsPage />;
    case 'approvals':
      return <MarketingApprovalQueuePage />;
    case 'agent':
      return <MarketingAgentPage />;
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

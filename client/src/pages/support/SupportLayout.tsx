import { useLocation } from 'react-router-dom';
import { SupportCategoriesPage } from './SupportCategoriesPage';
import { SupportDashboardPage } from './SupportDashboardPage';
import { SupportPoliciesPage } from './SupportPoliciesPage';
import { SupportTicketsPage } from './SupportTicketsPage';

export function SupportLayout() {
  const location = useLocation();
  const segment = location.pathname.split('/').filter(Boolean)[1];

  switch (segment) {
    case 'dashboard':
      return <SupportDashboardPage />;
    case 'sla':
      return <SupportPoliciesPage />;
    case 'categories':
      return <SupportCategoriesPage />;
    default:
      return <SupportTicketsPage />;
  }
}

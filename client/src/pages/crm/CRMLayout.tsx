import { useLocation } from 'react-router-dom';
import { CRMPipelinePage } from './CRMPipelinePage';
import { CRMContactsPage } from './CRMContactsPage';
import { CRMCompaniesPage } from './CRMCompaniesPage';
import { CRMForecastPage } from './CRMForecastPage';
import { CRMDashboardPage } from './CRMDashboardPage';

export function CRMLayout() {
  const location = useLocation();
  const segment = location.pathname.split('/').filter(Boolean)[1];

  const renderPage = () => {
    switch (segment) {
      case 'contacts':
        return <CRMContactsPage />;
      case 'companies':
        return <CRMCompaniesPage />;
      case 'forecast':
        return <CRMForecastPage />;
      case 'dashboard':
        return <CRMDashboardPage />;
      default:
        return <CRMPipelinePage />;
    }
  };

  return renderPage();
}

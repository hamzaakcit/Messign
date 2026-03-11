import { useUIStore } from '@/stores/uiStore';
import { useLocation } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { DashboardView } from '@/pages/DashboardView';
import { ChatView } from '@/pages/ChatView';
import { KnowledgeHubLayout } from '@/pages/knowledge-hub/KnowledgeHubLayout';
import { AchievementsView } from '@/pages/AchievementsView';
import { TeamView } from '@/pages/TeamView';
import { ProjectsView } from '@/pages/ProjectsView';
import { SettingsView } from '@/pages/SettingsView';
import { ReimbursementRouter } from '@/pages/ReimbursementRouter';
import { FinancePage } from '@/pages/FinancePage';
import { CRMLayout } from '@/pages/crm/CRMLayout';
import { MarketingLayout } from '@/pages/marketing/MarketingLayout';
import { RecruitmentLayout } from '@/pages/recruitment/RecruitmentLayout';
import { SupportLayout } from '@/pages/support/SupportLayout';
import { TimeTrackingPage } from '@/pages/time/TimeTrackingPage';
import { OKRPage } from '@/pages/okr/OKRPage';
import { AssetsLayout } from '@/pages/assets/AssetsLayout';
import { ContractsLayout } from '@/pages/contracts/ContractsLayout';
import { DoraPage } from '@/pages/DoraPage';
import { DoraDashPage } from '@/pages/DoraDashPage';
import { AutomationPoliciesPage } from '@/pages/dora/AutomationPoliciesPage';
import { AutomationLogPage } from '@/pages/dora/AutomationLogPage';
import { DailyBriefingPage } from '@/pages/dora/DailyBriefingPage';
import { ExecutiveDashboardPage } from '@/pages/executive/ExecutiveDashboardPage';
import { ReportHubPage } from '@/pages/reports/ReportHubPage';
import { NotificationsPage } from '@/pages/notifications/NotificationsPage';
import { Header } from './Header';
import { useAuthStore } from '@/stores/authStore';

export function MainContent() {
  const { currentView } = useUIStore();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isKnowledgeHub = location.pathname.startsWith('/knowledge-hub');
  const isLeader = ['admin', 'manager', 'dept_head', 'system_admin'].includes(String(user?.role ?? ''));

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        if (isLeader && (location.pathname === '/' || location.pathname === '/dashboard')) {
          return <Navigate to="/executive" replace />;
        }
        return <DashboardView />;
      case 'executive':
        return <ExecutiveDashboardPage />;
      case 'reports':
        return <ReportHubPage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'dora':
        if (location.pathname.startsWith('/dora/briefing')) {
          return <DailyBriefingPage />;
        }
        if (location.pathname.startsWith('/dora/automations/log')) {
          return <AutomationLogPage />;
        }
        if (location.pathname.startsWith('/dora/automations')) {
          return <AutomationPoliciesPage />;
        }
        return <DoraPage />;
      case 'game':
        return <DoraDashPage />;
      case 'chat':
        return <ChatView />;
      case 'knowledge':
        return <KnowledgeHubLayout />;
      case 'achievements':
        return <AchievementsView />;
      case 'team':
        return <TeamView />;
      case 'projects':
        return <ProjectsView />;
      case 'settings':
        return <SettingsView />;
      case 'finance':
        return <FinancePage />;
      case 'crm':
        return <CRMLayout />;
      case 'marketing':
        return <MarketingLayout />;
      case 'recruitment':
        return <RecruitmentLayout />;
      case 'support':
        return <SupportLayout />;
      case 'time':
        return <TimeTrackingPage />;
      case 'okr':
        return <OKRPage />;
      case 'assets':
        return <AssetsLayout />;
      case 'contracts':
        return <ContractsLayout />;
      case 'reimbursements':
      case 'invoices':
        return <ReimbursementRouter />;
      default:
        return <DashboardView />;
    }
  };

  if (isKnowledgeHub || currentView === 'knowledge') {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-app transition-colors duration-200">
        <Header />
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden animate-fade-in" role="main">
          <KnowledgeHubLayout />
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-app transition-colors duration-200">
      <Header />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden animate-fade-in" role="main">
        {renderView()}
      </main>
    </div>
  );
}

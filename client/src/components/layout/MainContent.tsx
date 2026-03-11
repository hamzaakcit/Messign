import React, { Suspense } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useLocation, Navigate } from 'react-router-dom';
import { PageSkeleton } from '@/components/ui';
import { Header } from './Header';
import { useAuthStore } from '@/stores/authStore';

const DashboardView = React.lazy(() => import('@/pages/DashboardView').then((m) => ({ default: m.DashboardView })));
const ChatView = React.lazy(() => import('@/pages/ChatView').then((m) => ({ default: m.ChatView })));
const KnowledgeHubLayout = React.lazy(() => import('@/pages/knowledge-hub/KnowledgeHubLayout').then((m) => ({ default: m.KnowledgeHubLayout })));
const AchievementsView = React.lazy(() => import('@/pages/AchievementsView').then((m) => ({ default: m.AchievementsView })));
const TeamView = React.lazy(() => import('@/pages/TeamView').then((m) => ({ default: m.TeamView })));
const ProjectsView = React.lazy(() => import('@/pages/ProjectsView').then((m) => ({ default: m.ProjectsView })));
const SettingsView = React.lazy(() => import('@/pages/SettingsView').then((m) => ({ default: m.SettingsView })));
const ReimbursementRouter = React.lazy(() => import('@/pages/ReimbursementRouter').then((m) => ({ default: m.ReimbursementRouter })));
const FinancePage = React.lazy(() => import('@/pages/FinancePage').then((m) => ({ default: m.FinancePage })));
const CRMLayout = React.lazy(() => import('@/pages/crm/CRMLayout').then((m) => ({ default: m.CRMLayout })));
const MarketingLayout = React.lazy(() => import('@/pages/marketing/MarketingLayout').then((m) => ({ default: m.MarketingLayout })));
const RecruitmentLayout = React.lazy(() => import('@/pages/recruitment/RecruitmentLayout').then((m) => ({ default: m.RecruitmentLayout })));
const SupportLayout = React.lazy(() => import('@/pages/support/SupportLayout').then((m) => ({ default: m.SupportLayout })));
const TimeTrackingPage = React.lazy(() => import('@/pages/time/TimeTrackingPage').then((m) => ({ default: m.TimeTrackingPage })));
const OKRPage = React.lazy(() => import('@/pages/okr/OKRPage').then((m) => ({ default: m.OKRPage })));
const AssetsLayout = React.lazy(() => import('@/pages/assets/AssetsLayout').then((m) => ({ default: m.AssetsLayout })));
const ContractsLayout = React.lazy(() => import('@/pages/contracts/ContractsLayout').then((m) => ({ default: m.ContractsLayout })));
const CultureDashboardPage = React.lazy(() => import('@/pages/culture/CultureDashboardPage').then((m) => ({ default: m.CultureDashboardPage })));
const DoraPage = React.lazy(() => import('@/pages/DoraPage').then((m) => ({ default: m.DoraPage })));
const DoraDashPage = React.lazy(() => import('@/pages/DoraDashPage').then((m) => ({ default: m.DoraDashPage })));
const AutomationPoliciesPage = React.lazy(() => import('@/pages/dora/AutomationPoliciesPage').then((m) => ({ default: m.AutomationPoliciesPage })));
const AutomationLogPage = React.lazy(() => import('@/pages/dora/AutomationLogPage').then((m) => ({ default: m.AutomationLogPage })));
const DailyBriefingPage = React.lazy(() => import('@/pages/dora/DailyBriefingPage').then((m) => ({ default: m.DailyBriefingPage })));
const ExecutiveDashboardPage = React.lazy(() => import('@/pages/executive/ExecutiveDashboardPage').then((m) => ({ default: m.ExecutiveDashboardPage })));
const ReportHubPage = React.lazy(() => import('@/pages/reports/ReportHubPage').then((m) => ({ default: m.ReportHubPage })));
const NotificationsPage = React.lazy(() => import('@/pages/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));

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
      case 'culture':
        return <CultureDashboardPage />;
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
        <main id="main-content" className="flex-1 flex flex-col min-h-0 overflow-hidden animate-fade-in" role="main">
          <Suspense fallback={<PageSkeleton variant="list" />}>
            <KnowledgeHubLayout />
          </Suspense>
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-app transition-colors duration-200">
      <Header />
      <main id="main-content" className="flex-1 flex flex-col min-h-0 overflow-hidden animate-fade-in" role="main">
        <Suspense fallback={<PageSkeleton variant="dashboard" />}>
          {renderView()}
        </Suspense>
      </main>
    </div>
  );
}

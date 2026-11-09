import React, { Suspense } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useLocation } from 'react-router-dom';
import { PageSkeleton } from '@/components/ui';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Header } from './Header';
import { mountsFrozenModules } from '@/lib/productSurface';

const EngageHomePage = React.lazy(() => import('@/engage/EngageHomePage').then((m) => ({ default: m.EngageHomePage })));

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

export function MainContent() {
  const currentView = useUIStore((s) => s.currentView);
  const focusMode = useUIStore((s) => s.focusMode);
  const location = useLocation();
  const isKnowledgeHub = location.pathname.startsWith('/knowledge-hub');

  const wrap = (key: string, node: React.ReactNode): React.ReactNode => (
    <ErrorBoundary resetKey={`${key}-${location.pathname}`}>{node}</ErrorBoundary>
  );

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return wrap('dashboard', <DashboardView />);
      case 'executive':
        return wrap('executive', <ExecutiveDashboardPage />);
      case 'reports':
        return wrap('reports', <ReportHubPage />);
      case 'dora': {
        if (location.pathname.startsWith('/dora/briefing')) {
          return wrap('dora-briefing', <DailyBriefingPage />);
        }
        if (location.pathname.startsWith('/dora/automations/log')) {
          return wrap('dora-automation-log', <AutomationLogPage />);
        }
        if (location.pathname.startsWith('/dora/automations')) {
          return wrap('dora-automations', <AutomationPoliciesPage />);
        }
        return wrap('dora', <DoraPage />);
      }
      case 'game':
        return wrap('game', <DoraDashPage />);
      case 'chat':
        return wrap('chat', <ChatView />);
      case 'knowledge':
        return wrap('knowledge', <KnowledgeHubLayout />);
      case 'achievements':
        return wrap('achievements', <AchievementsView />);
      case 'team':
        return wrap('team', <TeamView />);
      case 'projects':
        return wrap('projects', <ProjectsView />);
      case 'settings':
        return wrap('settings', <SettingsView />);
      case 'finance':
        return wrap('finance', <FinancePage />);
      case 'crm':
        return wrap('crm', <CRMLayout />);
      case 'marketing':
        // On engage the legacy marketing hub would call a non-tenant-safe API and the frozen Lucy assistant.
        return mountsFrozenModules() ? wrap('marketing', <MarketingLayout />) : wrap('marketing', <EngageHomePage />);
      case 'recruitment':
        return wrap('recruitment', <RecruitmentLayout />);
      case 'support':
        return wrap('support', <SupportLayout />);
      case 'okr':
        return wrap('okr', <OKRPage />);
      case 'assets':
        return wrap('assets', <AssetsLayout />);
      case 'contracts':
        return wrap('contracts', <ContractsLayout />);
      case 'culture':
        return wrap('culture', <CultureDashboardPage />);
      case 'reimbursements':
      case 'invoices':
        return wrap('reimbursements', <ReimbursementRouter />);
      default:
        return wrap('dashboard', <DashboardView />);
    }
  };

  if (isKnowledgeHub || currentView === 'knowledge') {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-app transition-colors duration-200">
        {!focusMode && <Header />}
        <main id="main-content" className="flex-1 flex flex-col min-h-0 overflow-hidden animate-fade-in" role="main">
          <ErrorBoundary resetKey={`knowledge-${location.pathname}`}>
            <Suspense fallback={<PageSkeleton variant="list" />}>
              <KnowledgeHubLayout />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-app transition-colors duration-200">
      {!focusMode && <Header />}
      <main id="main-content" className="flex-1 flex flex-col min-h-0 overflow-hidden animate-fade-in" role="main">
        <ErrorBoundary resetKey={currentView}>
          <Suspense fallback={<PageSkeleton variant="dashboard" />}>
            {renderView()}
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

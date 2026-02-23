import { useUIStore } from '@/stores/uiStore';
import { useLocation } from 'react-router-dom';
import { DashboardView } from '@/pages/DashboardView';
import { ChatView } from '@/pages/ChatView';
import { KnowledgeHubLayout } from '@/pages/knowledge-hub/KnowledgeHubLayout';
import { AchievementsView } from '@/pages/AchievementsView';
import { TeamView } from '@/pages/TeamView';
import { ProjectsView } from '@/pages/ProjectsView';
import { SettingsView } from '@/pages/SettingsView';
import { ReimbursementRouter } from '@/pages/ReimbursementRouter';
import { DoraPage } from '@/pages/DoraPage';
import { DoraDashPage } from '@/pages/DoraDashPage';
import { Header } from './Header';

export function MainContent() {
  const { currentView } = useUIStore();
  const location = useLocation();
  const isKnowledgeHub = location.pathname.startsWith('/knowledge-hub');

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView />;
      case 'dora':
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

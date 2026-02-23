import { useLocation } from 'react-router-dom';
import { Menu, Search, PanelRightOpen, PanelRightClose, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { Input } from '@/components/ui';
import { NotificationPanel } from '@/components/notifications';
import { KnowledgeHubIcon } from '@/components/knowledge-hub/icons';

const viewTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  dora: 'Dora',
  game: 'Dora Game',
  chat: 'Chat',
  knowledge: 'Knowledge Hub',
  achievements: 'Achievements',
  team: 'Team Directory',
  projects: 'Project Marketplace',
  settings: 'Settings',
  reimbursements: 'Reimbursements',
  invoices: 'Invoices',
};

export function Header() {
  const location = useLocation();
  const { currentView, toggleLeftSidebar, toggleRightSidebar, leftSidebarOpen, rightSidebarOpen, leftSidebarCollapsed, rightSidebarCollapsed, isMobile } = useUIStore();
  const isKnowledgeHub = location.pathname.startsWith('/knowledge-hub');

  return (
    <header className="h-16 border-b border-app flex items-center justify-between px-4 bg-app-sidebar backdrop-blur-sm transition-colors duration-200">
      <div className="flex items-center gap-4">
        {/* Toggle Left Sidebar */}
        <button
          onClick={toggleLeftSidebar}
          className="p-2 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors"
          aria-label={
            isMobile
              ? leftSidebarOpen
                ? 'Close left sidebar'
                : 'Open left sidebar'
              : leftSidebarCollapsed
                ? 'Expand left sidebar'
                : 'Collapse left sidebar'
          }
        >
          {isMobile ? (
            leftSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <Menu className="w-5 h-5" />
          ) : leftSidebarCollapsed ? (
            <PanelLeftOpen className="w-5 h-5" />
          ) : (
            <PanelLeftClose className="w-5 h-5" />
          )}
        </button>

        {/* View Title */}
        <div className="flex items-center gap-2">
          {(currentView === 'knowledge' || isKnowledgeHub) && <KnowledgeHubIcon size={24} active />}
          <h1 className="text-xl font-semibold text-app">{viewTitles[currentView]}</h1>
        </div>
      </div>

      {/* Search */}
      {!isMobile && (
        <div className="flex-1 max-w-md mx-8">
          <Input
            placeholder="Search..."
            icon={<Search className="w-4 h-4" />}
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Search (mobile) */}
        {isMobile && (
          <button className="p-2 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors">
            <Search className="w-5 h-5" />
          </button>
        )}

        {/* Notifications */}
        <NotificationPanel />

        {/* Toggle Right Sidebar */}
        <button
            onClick={toggleRightSidebar}
            className="p-2 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors"
            aria-label={
              isMobile
                ? rightSidebarOpen
                  ? 'Close right sidebar'
                  : 'Open right sidebar'
                : rightSidebarCollapsed
                  ? 'Expand right sidebar'
                  : 'Collapse right sidebar'
            }
          >
            {isMobile ? (
              rightSidebarOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />
            ) : rightSidebarCollapsed ? (
              <PanelRightOpen className="w-5 h-5" />
            ) : (
              <PanelRightClose className="w-5 h-5" />
            )}
          </button>
      </div>
    </header>
  );
}

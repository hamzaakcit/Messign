import { useLocation } from 'react-router-dom';
import { Search, ChevronRight, Menu } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { NotificationBell } from '@/components/notifications/NotificationBell';

const viewTitles: Record<string, string> = {
  dashboard: 'Dashboard',
  executive: 'Executive Dashboard',
  reports: 'Report Hub',
  notifications: 'Notifications',
  dora: 'Dora',
  game: 'Dora Game',
  chat: 'Chat',
  knowledge: 'Knowledge Hub',
  achievements: 'Achievements',
  team: 'Team Directory',
  projects: 'Project Marketplace',
  settings: 'Settings',
  finance: 'Finance',
  reimbursements: 'Reimbursements',
  invoices: 'Invoices',
  crm: 'Sales CRM',
  marketing: 'Marketing',
  recruitment: 'Recruitment',
  support: 'Support',
  time: 'Time Tracking',
  okr: 'OKRs & Goals',
  assets: 'Assets',
  contracts: 'Contracts',
  culture: 'Culture',
};

function Breadcrumbs({ pathname, currentView }: { pathname: string; currentView: string }) {
  const segments = pathname.split('/').filter(Boolean);
  const root = viewTitles[currentView] ?? currentView;

  if (segments.length <= 1) {
    return <span className="text-sm font-medium text-app-muted">{root}</span>;
  }

  const sub = segments
    .slice(1)
    .map((s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      <span className="text-app-muted font-medium">{root}</span>
      {sub.map((label, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight className="w-3 h-3 text-app-muted/50" />
          <span className={i === sub.length - 1 ? 'text-app font-medium' : 'text-app-muted'}>{label}</span>
        </span>
      ))}
    </nav>
  );
}

export function Header() {
  const location = useLocation();
  const currentView = useUIStore((s) => s.currentView);
  const toggleLeftSidebar = useUIStore((s) => s.toggleLeftSidebar);
  const leftSidebarOpen = useUIStore((s) => s.leftSidebarOpen);
  const isMobile = useUIStore((s) => s.isMobile);
  const openCommandSurface = useUIStore((s) => s.openCommandSurface);

  return (
    <header className="h-12 border-b border-app flex items-center justify-between px-4 bg-app-sidebar backdrop-blur-sm transition-colors duration-200">
      <div className="flex items-center gap-3">
        {isMobile && (
          <button
            onClick={toggleLeftSidebar}
            className="p-1.5 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors"
            aria-label={leftSidebarOpen ? 'Close menu' : 'Open menu'}
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <Breadcrumbs pathname={location.pathname} currentView={currentView} />
      </div>

      {!isMobile && (
        <div className="flex-1 max-w-md mx-8">
          <button
            data-testid="onboarding-cmdk"
            onClick={openCommandSurface}
            className="w-full flex items-center gap-3 px-3 py-1.5 rounded-lg border transition-colors text-left"
            style={{
              backgroundColor: 'var(--input-bg)',
              borderColor: 'var(--input-border)',
              color: 'var(--input-placeholder)',
            }}
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1 text-sm">Search or ask Dora...</span>
            <kbd
              className="hidden lg:inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono"
              style={{
                backgroundColor: 'var(--app-card)',
                color: 'var(--app-text-tertiary)',
                border: '1px solid var(--app-border)',
              }}
            >
              ⌘K
            </kbd>
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        {isMobile && (
          <button
            onClick={openCommandSurface}
            className="p-1.5 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors"
            aria-label="Search"
          >
            <Search className="w-5 h-5" />
          </button>
        )}

        <div data-testid="onboarding-notifications">
          <NotificationBell />
        </div>
      </div>
    </header>
  );
}

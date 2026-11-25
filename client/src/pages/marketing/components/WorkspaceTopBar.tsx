import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, LayoutGrid, Mail, Plus, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/lib/routes';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

interface TabDef {
  id: string;
  label: string;
  icon: typeof LayoutGrid;
  path: string;
}

const TABS: TabDef[] = [
  { id: 'offers', label: 'Offers', icon: LayoutGrid, path: ROUTES.MARKETING },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, path: ROUTES.MARKETING_CALENDAR },
  { id: 'builder', label: 'Builder', icon: Mail, path: ROUTES.MARKETING_BUILDER },
  { id: 'shop', label: 'Shop settings', icon: Store, path: ROUTES.MARKETING_SHOP },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePath(p: string): string {
  return p.replace(/\/$/, '') || '/';
}

function getActiveTabId(pathname: string): string | null {
  const p = normalizePath(pathname);
  const match = TABS.find((t) => normalizePath(t.path) === p);
  return match?.id ?? null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkspaceTopBar(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();

  const activeTab = getActiveTabId(location.pathname);

  return (
    <div
      className={cn('flex items-center gap-1 px-2 sm:px-3 py-1.5 shrink-0 z-20 min-w-0', 'border-b border-[#e7e0d6] bg-[#f4efe8]')}
    >
      {/* Primary tabs */}
      <nav className="flex items-center gap-0.5 overflow-x-auto min-w-0" aria-label="Marketing workspace">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => navigate(tab.path)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                active
                  ? 'bg-[#1c1917] text-white'
                  : 'text-[#78716c] hover:text-[#1c1917] hover:bg-white',
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* One way to create: New offer (UX-08) */}
      <button
        type="button"
        onClick={() => navigate(ROUTES.MARKETING_OFFER_NEW)}
        className="flex shrink-0 items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#1c1917] text-white hover:bg-[#292524] transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>New offer</span>
      </button>
    </div>
  );
}

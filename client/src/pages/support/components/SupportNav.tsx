import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, FolderTree, LifeBuoy, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'tickets', label: 'Tickets', path: '/support', icon: LifeBuoy },
  { id: 'dashboard', label: 'Dashboard', path: '/support/dashboard', icon: BarChart3 },
  { id: 'sla', label: 'SLA Policies', path: '/support/sla', icon: ShieldAlert },
  { id: 'categories', label: 'Categories', path: '/support/categories', icon: FolderTree },
];

export function SupportNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = (() => {
    const segment = location.pathname.split('/').filter(Boolean)[1];
    if (segment === 'dashboard') return 'dashboard';
    if (segment === 'sla') return 'sla';
    if (segment === 'categories') return 'categories';
    return 'tickets';
  })();

  return (
    <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => navigate(tab.path)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap',
              isActive
                ? 'bg-primary-500/20 text-primary-400'
                : 'text-app-muted hover:text-app-text hover:bg-white/5',
            )}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

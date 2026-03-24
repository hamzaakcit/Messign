import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { BarChart3, Boxes, KeyRound } from 'lucide-react';

const tabs = [
  { id: 'equipment', label: 'Equipment', path: '/assets', icon: Boxes },
  { id: 'licenses', label: 'Licenses', path: '/assets/licenses', icon: KeyRound },
  { id: 'dashboard', label: 'Dashboard', path: '/assets/dashboard', icon: BarChart3 },
];

export function AssetsNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const segment = location.pathname.split('/').filter(Boolean)[1];
  const active = segment === 'licenses' ? 'licenses' : segment === 'dashboard' ? 'dashboard' : 'equipment';
  return (
    <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => navigate(tab.path)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap',
              isActive ? 'bg-primary-500/20 text-primary-400' : 'text-app-muted hover:text-app-text hover:bg-app-nav-hover',
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

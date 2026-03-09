import { useLocation, useNavigate } from 'react-router-dom';
import { Kanban, Users, Building2, TrendingUp, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'pipeline', label: 'Pipeline', path: '/crm', icon: Kanban },
  { id: 'contacts', label: 'Contacts', path: '/crm/contacts', icon: Users },
  { id: 'companies', label: 'Companies', path: '/crm/companies', icon: Building2 },
  { id: 'forecast', label: 'Forecast', path: '/crm/forecast', icon: TrendingUp },
  { id: 'dashboard', label: 'Dashboard', path: '/crm/dashboard', icon: BarChart3 },
];

export function CRMNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = (() => {
    const seg = location.pathname.split('/').filter(Boolean)[1];
    if (seg === 'contacts') return 'contacts';
    if (seg === 'companies') return 'companies';
    if (seg === 'forecast') return 'forecast';
    if (seg === 'dashboard') return 'dashboard';
    return 'pipeline';
  })();

  return (
    <div className="flex items-center gap-1 mb-4">
      {tabs.map(tab => {
        const isActive = tab.id === activeTab;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            onClick={() => navigate(tab.path)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5',
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

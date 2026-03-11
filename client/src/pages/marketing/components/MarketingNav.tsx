import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, CalendarDays, Mail, Megaphone, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'campaigns', label: 'Campaigns', path: '/marketing', icon: Megaphone },
  { id: 'content', label: 'Content Calendar', path: '/marketing/content', icon: CalendarDays },
  { id: 'leads', label: 'Leads', path: '/marketing/leads', icon: Users },
  { id: 'email', label: 'Email', path: '/marketing/email', icon: Mail },
  { id: 'dashboard', label: 'Dashboard', path: '/marketing/dashboard', icon: BarChart3 },
];

export function MarketingNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const segment = location.pathname.split('/').filter(Boolean)[1];

  const activeTab =
    segment === 'content'
      ? 'content'
      : segment === 'leads'
        ? 'leads'
        : segment === 'email'
          ? 'email'
          : segment === 'dashboard'
            ? 'dashboard'
            : 'campaigns';

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

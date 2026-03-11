import { useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Briefcase, CalendarClock, KanbanSquare, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { id: 'jobs', label: 'Jobs', path: '/recruitment', icon: Briefcase },
  { id: 'pipeline', label: 'Pipeline', path: '/recruitment/pipeline', icon: KanbanSquare },
  { id: 'candidates', label: 'Candidates', path: '/recruitment/candidates', icon: Users },
  { id: 'interviews', label: 'Interviews', path: '/recruitment/interviews', icon: CalendarClock },
  { id: 'dashboard', label: 'Dashboard', path: '/recruitment/dashboard', icon: BarChart3 },
];

export function RecruitmentNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const segment = location.pathname.split('/').filter(Boolean)[1];

  const activeTab =
    segment === 'pipeline'
      ? 'pipeline'
      : segment === 'candidates'
        ? 'candidates'
        : segment === 'interviews'
          ? 'interviews'
          : segment === 'dashboard'
            ? 'dashboard'
            : 'jobs';

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

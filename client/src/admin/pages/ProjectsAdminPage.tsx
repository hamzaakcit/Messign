import { useSearchParams } from 'react-router-dom';
import { Briefcase, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProjectMarketplaceAdmin } from './ProjectMarketplaceAdmin';
import { TalentHeatmap } from './TalentHeatmap';

type TabId = 'marketplace' | 'talent-heatmap';

const TABS: { id: TabId; label: string; icon: typeof Briefcase }[] = [
  { id: 'marketplace', label: 'Marketplace', icon: Briefcase },
  { id: 'talent-heatmap', label: 'Talent Heatmap', icon: Flame },
];

export function ProjectsAdminPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as TabId) || 'marketplace';
  const activeTab: TabId = TABS.some((t) => t.id === tab) ? tab : 'marketplace';

  const setTab = (id: TabId) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === 'marketplace') next.delete('tab');
      else next.set('tab', id);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-app-border px-6 pt-4 pb-0">
        <div className="flex gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 rounded-t-lg text-sm font-medium border-b-2 transition-colors -mb-px',
                  activeTab === t.id
                    ? 'border-primary-500 text-primary-400 bg-app-surface-tertiary/50'
                    : 'border-transparent text-app-muted hover:text-app hover:bg-app-surface-tertiary/30'
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {activeTab === 'marketplace' && <ProjectMarketplaceAdmin />}
        {activeTab === 'talent-heatmap' && <TalentHeatmap />}
      </div>
    </div>
  );
}

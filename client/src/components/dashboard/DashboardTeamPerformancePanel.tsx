import { useState, useMemo } from 'react';
import { Trophy, Medal, Award, Search, Building2 } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboardStore';
import { Avatar } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { TeamMemberEnterprise, TeamMemberWholesale } from '@/types/performance';

const MEDAL_ICONS = [Trophy, Medal, Award];

export type DashboardTeamView = 'enterprise' | 'wholesale';

type TeamMember = TeamMemberEnterprise | TeamMemberWholesale;

function getPrimaryMetric(
  member: TeamMember,
  activeMetric: 'revenue' | 'sms' | 'mail',
  view: DashboardTeamView
): string {
  if (view === 'enterprise') {
    const m = member as TeamMemberEnterprise;
    if (activeMetric === 'revenue') return m.metrics.revenue.formatted;
    if (activeMetric === 'sms') return m.metrics.smsAttempts.formatted;
    if (activeMetric === 'mail') return m.metrics.mailAttempts.formatted;
  } else {
    const m = member as TeamMemberWholesale;
    if (activeMetric === 'revenue') return m.metrics.revenue.formatted;
    if (activeMetric === 'sms') return m.metrics.smsVolume.formatted;
    if (activeMetric === 'mail') return m.metrics.revenue.formatted; // fallback for wholesale
  }
  return '—';
}

interface DashboardTeamPerformancePanelProps {
  view: DashboardTeamView;
  members: TeamMember[];
  loading?: boolean;
  error?: string | null;
  onViewChange: (view: DashboardTeamView) => void;
}

export function DashboardTeamPerformancePanel({
  view,
  members,
  loading,
  error,
  onViewChange,
}: DashboardTeamPerformancePanelProps) {
  const { activeMetric, activeEntity, setActiveEntity } = useDashboardStore();
  const [search, setSearch] = useState('');

  const filteredMembers = useMemo(() => {
    if (!search.trim()) return members;
    const q = search.trim().toLowerCase();
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.role?.toLowerCase().includes(q)
    );
  }, [members, search]);

  return (
    <div className="h-full flex flex-col rounded-xl border border-app-border bg-app-card overflow-hidden">
      <div className="shrink-0 flex flex-col gap-3 px-4 py-3 border-b border-app-border">
        <h2 className="text-sm font-semibold text-app-text flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-400" />
          Team Performance
        </h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-app-muted" />
          <input
            type="search"
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-app-border bg-app-surface-tertiary text-app-text placeholder:text-app-muted focus:outline-none focus:ring-1 focus:ring-[#2dd4bf] focus:border-[#2dd4bf]"
            aria-label="Search team members"
          />
        </div>
        <div className="flex rounded-lg border border-app-border bg-app-surface-tertiary p-1">
          <button
            type="button"
            onClick={() => onViewChange('enterprise')}
            className={cn(
              'flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              view === 'enterprise'
                ? 'bg-primary-500 text-app-text shadow-sm'
                : 'text-app-muted hover:text-app-text'
            )}
          >
            Enterprise
          </button>
          <button
            type="button"
            onClick={() => onViewChange('wholesale')}
            className={cn(
              'flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              view === 'wholesale'
                ? 'bg-primary-500 text-app-text shadow-sm'
                : 'text-app-muted hover:text-app-text'
            )}
          >
            Wholesale
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2 rounded-lg bg-app-surface-tertiary animate-pulse"
              >
                <div className="w-8 h-8 rounded-lg bg-app-surface-tertiary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="h-3 w-20 rounded bg-app-surface-tertiary" />
                  <div className="h-2.5 w-14 rounded bg-app-surface-tertiary mt-1" />
                </div>
              </div>
            ))}
          </div>
        ) : error && members.length === 0 ? (
          <p className="text-xs text-red-400 py-4 text-center">{error}</p>
        ) : filteredMembers.length === 0 ? (
          <p className="text-xs text-app-muted py-4 text-center">
            {search ? 'No members match your search' : 'No team data yet'}
          </p>
        ) : (
          <div className="space-y-1">
            {/* Company / All view row */}
            <button
              type="button"
              onClick={() => setActiveEntity('company', null)}
              className={cn(
                'w-full flex items-center gap-2 p-2 rounded-lg transition-all duration-200 text-left',
                activeEntity === 'company'
                  ? 'ring-1 ring-[#2dd4bf] bg-app-surface-tertiary'
                  : 'hover:bg-app-nav-hover'
              )}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-primary-500/20">
                <Building2 className="w-4 h-4 text-primary-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-app-text">Company</p>
                <p className="text-xs text-app-muted">Aggregate view</p>
              </div>
            </button>
            {filteredMembers.map((member) => {
              const MedalIcon = member.rank <= 3 ? MEDAL_ICONS[member.rank - 1] ?? Award : null;
              const isActive = activeEntity === member.id;
              const primaryMetric = getPrimaryMetric(member, activeMetric, view);

              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setActiveEntity(member.id, member.name)}
                  className={cn(
                    'w-full flex items-center gap-2 p-2 rounded-lg transition-all duration-200 text-left',
                    isActive
                      ? 'ring-1 ring-[#2dd4bf] bg-app-surface-tertiary'
                      : 'hover:bg-app-nav-hover'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                      member.rank <= 3
                        ? ''
                        : 'bg-app-surface-tertiary'
                    )}
                    style={
                      member.rank <= 3
                        ? {
                            backgroundColor:
                              member.rank === 1
                                ? 'rgba(234,179,8,0.2)'
                                : member.rank === 2
                                  ? 'rgba(156,163,175,0.2)'
                                  : 'rgba(180,83,9,0.2)',
                          }
                        : undefined
                    }
                  >
                    {MedalIcon ? (
                      <MedalIcon
                        className="w-4 h-4"
                        style={{
                          color:
                            member.rank === 1
                              ? '#eab308'
                              : member.rank === 2
                                ? '#9ca3af'
                                : '#b45309',
                        }}
                      />
                    ) : (
                      <span className="text-xs font-medium text-app-text">
                        {member.rank}
                      </span>
                    )}
                  </div>
                  <Avatar
                    src={member.avatar}
                    name={member.name}
                    size="xs"
                    showStatus={false}
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-app-text truncate">
                      {member.name}
                    </p>
                    <p className="text-xs text-app-muted truncate">
                      {member.role}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-app-text shrink-0 tabular-nums">
                    {primaryMetric}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

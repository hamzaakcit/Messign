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
    <div className="h-full flex flex-col rounded-xl border border-gray-800 bg-[#13151a] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] overflow-hidden">
      <div className="shrink-0 flex flex-col gap-3 px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-400" />
          Team Performance
        </h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="search"
            placeholder="Search members..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-700 bg-white/5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#2dd4bf] focus:border-[#2dd4bf]"
            aria-label="Search team members"
          />
        </div>
        <div className="flex rounded-lg border border-gray-700 bg-white/5 p-1">
          <button
            type="button"
            onClick={() => onViewChange('enterprise')}
            className={cn(
              'flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              view === 'enterprise'
                ? 'bg-primary-500 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
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
                ? 'bg-primary-500 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
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
                className="flex items-center gap-2 p-2 rounded-lg bg-white/5 animate-pulse"
              >
                <div className="w-8 h-8 rounded-lg bg-white/10 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="h-3 w-20 rounded bg-white/10" />
                  <div className="h-2.5 w-14 rounded bg-white/5 mt-1" />
                </div>
              </div>
            ))}
          </div>
        ) : error && members.length === 0 ? (
          <p className="text-xs text-red-400 py-4 text-center">{error}</p>
        ) : filteredMembers.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center">
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
                  ? 'ring-1 ring-[#2dd4bf] bg-white/5'
                  : 'hover:bg-white/5'
              )}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-primary-500/20">
                <Building2 className="w-4 h-4 text-primary-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">Company</p>
                <p className="text-xs text-gray-400">Aggregate view</p>
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
                      ? 'ring-1 ring-[#2dd4bf] bg-white/5'
                      : 'hover:bg-white/5'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                      member.rank <= 3
                        ? ''
                        : 'bg-white/5'
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
                      <span className="text-xs font-medium text-white">
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
                    <p className="text-sm font-medium text-white truncate">
                      {member.name}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {member.role}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-white shrink-0 tabular-nums">
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

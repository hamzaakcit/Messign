import { useState, useEffect } from 'react';
import { Trophy, Medal, Award, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useDashboardStore } from '@/stores/dashboardStore';
import { performanceAPI } from '@/lib/api';
import { Avatar } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { TeamMemberEnterprise } from '@/types/performance';

const MEDAL_ICONS = [Trophy, Medal, Award];

export function DashboardTopPerformers() {
  const { user } = useAuthStore();
  const { activeEntity, setActiveEntity } = useDashboardStore();
  const [topMembers, setTopMembers] = useState<TeamMemberEnterprise[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    performanceAPI
      .getTeam(user.id, 'enterprise-sales')
      .then((res) => {
        if (cancelled) return;
        const data = (res as { success: boolean; data: { members?: TeamMemberEnterprise[] } }).data;
        const members = (data?.members ?? []) as TeamMemberEnterprise[];
        setTopMembers(members.slice(0, 3));
      })
      .catch(() => {
        if (!cancelled) setTopMembers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!user?.id) return null;

  return (
    <div className="h-full flex flex-col rounded-xl border border-gray-800 bg-[#13151a] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-400" />
          Top Performers
        </h2>
        <a
          href="/projects"
          className="text-xs text-gray-400 hover:text-primary-400 flex items-center gap-0.5 transition-colors"
        >
          View all <ChevronRight className="w-3 h-3" />
        </a>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3 custom-scrollbar">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 animate-pulse">
                <div className="w-9 h-9 rounded-lg bg-white/10" />
                <div className="flex-1">
                  <div className="h-3 w-20 rounded bg-white/10" />
                  <div className="h-2.5 w-14 rounded bg-white/5 mt-1" />
                </div>
              </div>
            ))}
          </div>
        ) : topMembers.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center">No team data yet</p>
        ) : (
          <div className="space-y-2">
            {topMembers.map((member, idx) => {
              const MedalIcon = MEDAL_ICONS[idx] ?? Award;
              const isActive = activeEntity === member.id;
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setActiveEntity(member.id, member.name)}
                  className={cn(
                    'w-full flex items-center gap-2 p-2 rounded-lg transition-colors text-left',
                    isActive
                      ? 'ring-1 ring-[#2dd4bf] bg-white/5'
                      : 'hover:bg-white/5'
                  )}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: idx === 0 ? 'rgba(234,179,8,0.2)' : idx === 1 ? 'rgba(156,163,175,0.2)' : 'rgba(180,83,9,0.2)',
                    }}
                  >
                    <MedalIcon
                      className="w-4 h-4"
                      style={{
                        color: idx === 0 ? '#eab308' : idx === 1 ? '#9ca3af' : '#b45309',
                      }}
                    />
                  </div>
                  <Avatar src={member.avatar} name={member.name} size="sm" showStatus={false} className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{member.name}</p>
                    <p className="text-xs text-gray-400 truncate">{member.role}</p>
                  </div>
                  <span className="text-xs font-medium text-gray-500">#{member.rank}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { performanceAPI } from '@/lib/api';
import { DashboardKPIRow } from '@/components/dashboard/DashboardKPIRow';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { PerformanceTrendChart } from '@/components/dashboard/PerformanceTrendChart';
import {
  DashboardTeamPerformancePanel,
  type DashboardTeamView,
} from '@/components/dashboard/DashboardTeamPerformancePanel';
import { companyMetrics } from '@/data/dashboard';
import type { TeamMemberEnterprise, TeamMemberWholesale } from '@/types/performance';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 },
};

export function DashboardView() {
  const { user } = useAuthStore();
  const [teamView, setTeamView] = useState<DashboardTeamView>('enterprise');
  const [enterpriseMembers, setEnterpriseMembers] = useState<TeamMemberEnterprise[]>([]);
  const [wholesaleMembers, setWholesaleMembers] = useState<TeamMemberWholesale[]>([]);
  const [enterpriseLoading, setEnterpriseLoading] = useState(true);
  const [wholesaleLoading, setWholesaleLoading] = useState(true);
  const [enterpriseError, setEnterpriseError] = useState<string | null>(null);
  const [wholesaleError, setWholesaleError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setEnterpriseLoading(true);
    setEnterpriseError(null);
    performanceAPI
      .getTeam(user.id, 'enterprise-sales')
      .then((res) => {
        if (cancelled) return;
        const data = (res as { success: boolean; data: { members?: TeamMemberEnterprise[] } }).data;
        setEnterpriseMembers((data?.members ?? []) as TeamMemberEnterprise[]);
      })
      .catch((err) => {
        if (!cancelled) setEnterpriseError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setEnterpriseLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    setWholesaleLoading(true);
    setWholesaleError(null);
    performanceAPI
      .getTeam(user.id, 'wholesale-sms')
      .then((res) => {
        if (cancelled) return;
        const data = (res as { success: boolean; data: { members?: TeamMemberWholesale[] } }).data;
        setWholesaleMembers((data?.members ?? []) as TeamMemberWholesale[]);
      })
      .catch((err) => {
        if (!cancelled) setWholesaleError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setWholesaleLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!user) return null;

  const members = teamView === 'enterprise' ? enterpriseMembers : wholesaleMembers;
  const loading = teamView === 'enterprise' ? enterpriseLoading : wholesaleLoading;
  const error = teamView === 'enterprise' ? enterpriseError : wholesaleError;

  return (
    <div
      className="h-[calc(100vh-80px)] overflow-hidden w-full bg-app transition-colors duration-200"
      role="main"
      aria-label="Dashboard"
    >
      <div className="px-6 pt-4">
        <DoraInsightBar module="dashboard" />
      </div>
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-12 grid-rows-12 gap-4 h-full p-6"
      >
        {/* Analytics Stage (Left - 75% width) */}
        <motion.div
          variants={item}
          className="col-span-9 row-span-12 h-full flex flex-col gap-4 min-h-0"
        >
          {/* Compact KPI Row */}
          <div className="shrink-0">
            <DashboardKPIRow metrics={companyMetrics} />
          </div>

          {/* Massive Interactive Chart */}
          <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-gray-800 bg-[#13151a] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] p-4">
            <PerformanceTrendChart />
          </div>
        </motion.div>

        {/* Command Panel (Right - 25% width) */}
        <motion.div
          variants={item}
          className="col-span-3 row-span-12 h-full flex flex-col gap-4 min-h-0"
        >
          <div className="h-full min-h-0 flex flex-col">
            <DashboardTeamPerformancePanel
              view={teamView}
              members={members}
              loading={loading}
              error={error}
              onViewChange={setTeamView}
            />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

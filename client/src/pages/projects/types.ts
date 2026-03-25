import type { MarketplaceProject } from '@/lib/api';

/** Side op from bounties API (display in Opportunity Hub) */
export interface SideOpItem {
  id: string;
  title: string;
  description: string;
  category?: string;
  xp_reward: number;
  estimated_minutes: number;
  status: string;
  creator?: { name?: string };
}

export type OpportunityFilter = 'all' | 'projects' | 'side_ops' | 'mspd';

export type TimeCommitmentFilter = '' | 'low' | 'medium' | 'high' | 'full';
export type XpRangeFilter = '' | '0-100' | '100-250' | '250-500' | '500+';
export type MarketplaceStatusFilter = '' | 'recruiting' | 'active' | 'hot' | 'double-xp';

/** Distinct department slots on a project (for apply UI). */
export function getDistinctRecruitmentDepts(project: MarketplaceProject): string[] {
  const cfg = project.recruitment_config;
  if (!Array.isArray(cfg) || cfg.length === 0) return [];
  return [...new Set(cfg.map((s) => s.dept).filter(Boolean))];
}

export function matchesTimeCommitment(minutes: number | null | undefined, filter: TimeCommitmentFilter): boolean {
  if (!filter) return true;
  if (minutes == null || minutes === 0) return true;
  const m = minutes;
  switch (filter) {
    case 'low':
      return m <= 300;
    case 'medium':
      return m > 300 && m <= 900;
    case 'high':
      return m > 900 && m <= 1800;
    case 'full':
      return m > 1800;
    default:
      return true;
  }
}

export function matchesXpRange(xp: number | undefined, filter: XpRangeFilter): boolean {
  if (!filter) return true;
  const x = xp ?? 0;
  switch (filter) {
    case '0-100':
      return x >= 0 && x <= 100;
    case '100-250':
      return x > 100 && x <= 250;
    case '250-500':
      return x > 250 && x <= 500;
    case '500+':
      return x > 500;
    default:
      return true;
  }
}

export function matchesMarketplaceStatus(project: MarketplaceProject, filter: MarketplaceStatusFilter): boolean {
  if (!filter) return true;
  switch (filter) {
    case 'recruiting':
      return project.recruitment_status === 'recruiting' || project.recruitment_status === undefined;
    case 'active':
      return project.recruitment_status === 'active';
    case 'hot':
      return Boolean(project.is_featured);
    case 'double-xp':
      return (project.xp_reward ?? 0) >= 200;
    default:
      return true;
  }
}

export function matchesSideOpItemStatus(item: SideOpItem, filter: MarketplaceStatusFilter): boolean {
  if (!filter) return true;
  switch (filter) {
    case 'recruiting':
      return item.status === 'OPEN';
    case 'active':
      return false;
    case 'hot':
      return false;
    case 'double-xp':
      return (item.xp_reward ?? 0) >= 200;
    default:
      return true;
  }
}

const DEFAULT_DEPT_COLOR = { bg: 'rgba(128, 128, 128, 0.2)', text: '#888', border: '#888' };

export const departmentColors: Record<string, { bg: string; text: string; border: string }> = {
  engineering: { bg: 'rgba(99, 179, 237, 0.15)', text: '#63B3ED', border: '#63B3ED' },
  product: { bg: 'rgba(246, 173, 85, 0.15)', text: '#F6AD55', border: '#F6AD55' },
  design: { bg: 'rgba(237, 100, 166, 0.15)', text: '#ED64A6', border: '#ED64A6' },
  marketing: { bg: 'rgba(72, 187, 120, 0.15)', text: '#48BB78', border: '#48BB78' },
  sales: { bg: 'rgba(159, 122, 234, 0.15)', text: '#9F7AEA', border: '#9F7AEA' },
  operations: { bg: 'rgba(237, 137, 54, 0.15)', text: '#ED8936', border: '#ED8936' },
};

export function getDeptColor(dept: string): { bg: string; text: string; border: string } {
  return departmentColors[dept] ?? DEFAULT_DEPT_COLOR;
}

export function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Projects with >100 MP or DB is_mspd are shown as MSPD (premium tier). */
export function isMspdProject(project: MarketplaceProject): boolean {
  return Boolean(project.is_mspd) || (project.xp_reward ?? 0) > 100;
}

/** Projects with 0 MP or opportunity_type side_op are shown as Side Ops. */
export function isSideOpProject(project: MarketplaceProject): boolean {
  return (project.opportunity_type ?? 'project') === 'side_op' || (project.xp_reward ?? 0) === 0;
}

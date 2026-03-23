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

import type { ApprovalQueueItem, RiskLevel } from './types';

export function deriveRiskLevel(item: ApprovalQueueItem): RiskLevel {
  const { warning_count: wc } = item.compliance;
  if (wc.high > 0) return 'high';
  if (wc.medium > 0) return 'medium';
  if (wc.low > 0) return 'low';
  return 'none';
}

export function channelLabel(ch: string): string {
  const map: Record<string, string> = {
    blog: 'Blog',
    email: 'Email',
    social: 'Social',
    linkedin: 'LinkedIn',
    instagram: 'Instagram',
    battlecard: 'Battlecard',
    other: 'Other',
  };
  return map[ch] ?? ch;
}

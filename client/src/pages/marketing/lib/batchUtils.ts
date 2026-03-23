export const BATCH_CHANNELS = ['email', 'twitter', 'instagram', 'linkedin', 'sms'] as const;

export const CHANNEL_LABELS: Record<string, string> = {
  email: 'Email',
  twitter: 'Twitter/X',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  sms: 'SMS',
};

export function getDefaultSelectedChannels(heroChannel: string): string[] {
  return BATCH_CHANNELS.filter((c) => c !== heroChannel);
}

export function getAtomizeButtonText(count: number): string {
  if (count === 0) return 'Select channels';
  return `Atomize to ${count} Channel${count !== 1 ? 's' : ''}`;
}

export function formatElapsedTime(startedAt: string): string {
  const elapsed = Date.now() - new Date(startedAt).getTime();
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function getResultStatusHeader(status: string): { text: string; color: string } {
  switch (status) {
    case 'completed':
      return { text: 'All content generated', color: 'green' };
    case 'partial':
      return { text: 'Partially complete', color: 'amber' };
    case 'failed':
      return { text: 'Generation failed', color: 'red' };
    case 'cancelled':
      return { text: 'Batch cancelled', color: 'gray' };
    default:
      return { text: 'Unknown status', color: 'gray' };
  }
}

export function getRetryableChannels(
  results: Array<{ channel: string; status: string }>,
): string[] {
  return results.filter((r) => r.status === 'failed').map((r) => r.channel);
}

export function getProgressPercentage(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

// -- Channel & status metadata for richer UI rendering --

export const BATCH_CHANNEL_META: Record<
  string,
  { displayName: string; description: string }
> = {
  email: { displayName: 'Email', description: 'VA2 Design Manifest email' },
  twitter: { displayName: 'Twitter/X', description: 'Tweet thread variants' },
  instagram: {
    displayName: 'Instagram',
    description: 'Carousel slides with image prompts',
  },
  linkedin: {
    displayName: 'LinkedIn',
    description: 'Professional long-form post',
  },
  sms: { displayName: 'SMS', description: 'Concise SMS copy with opt-out' },
};

export const BATCH_STATUS_META: Record<string, { label: string }> = {
  pending: { label: 'Pending' },
  processing: { label: 'Processing' },
  completed: { label: 'Completed' },
  failed: { label: 'Failed' },
  partial: { label: 'Partially Complete' },
  cancelled: { label: 'Cancelled' },
};

export function calculateBatchProgress(
  completed: number,
  failed: number,
  total: number,
): number {
  if (total === 0) return 0;
  return Math.round(((completed + failed) / total) * 100);
}

export function formatBatchDuration(
  startedAt: string | null,
  completedAt: string | null,
): string {
  if (!startedAt || !completedAt) return '';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function canRetryChannel(status: string): boolean {
  return status === 'failed';
}

export function hasContentLink(
  status: string,
  contentId: string | null,
): boolean {
  return status === 'completed' && contentId != null;
}

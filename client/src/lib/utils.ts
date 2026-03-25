import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

export function getInitials(name: string | undefined | null): string {
  if (name == null || typeof name !== 'string') return '?';
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'online':
      return 'bg-success-500';
    case 'away':
      return 'bg-warning-500';
    case 'busy':
      return 'bg-danger-500';
    case 'deep_work':
      return 'bg-amber-500 animate-pulse';
    default:
      return 'bg-gray-500';
  }
}

export function getRarityColor(rarity: string): string {
  switch (rarity) {
    case 'common':
      return 'border-gray-500 text-app-muted';
    case 'rare':
      return 'border-primary-500 text-primary-400';
    case 'epic':
      return 'border-accent-500 text-accent-400';
    case 'legendary':
      return 'border-warning-500 text-warning-400';
    default:
      return 'border-gray-500 text-app-muted';
  }
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'urgent':
      return 'bg-danger-500/20 text-danger-500 border-danger-500/30';
    case 'high':
      return 'bg-warning-500/20 text-warning-500 border-warning-500/30';
    case 'medium':
      return 'bg-primary-500/20 text-primary-400 border-primary-500/30';
    case 'low':
      return 'bg-gray-500/20 text-app-muted border-gray-500/30';
    default:
      return 'bg-gray-500/20 text-app-muted border-gray-500/30';
  }
}

export function getProjectTypeColor(type: string): string {
  switch (type) {
    case 'product':
      return 'bg-primary-500/20 text-primary-400';
    case 'engineering':
      return 'bg-accent-500/20 text-accent-400';
    case 'design':
      return 'bg-success-500/20 text-success-500';
    case 'marketing':
      return 'bg-warning-500/20 text-warning-500';
    default:
      return 'bg-gray-500/20 text-app-muted';
  }
}

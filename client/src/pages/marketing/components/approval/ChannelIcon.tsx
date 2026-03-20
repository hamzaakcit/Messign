import { FileText, Instagram, Linkedin, Mail, Megaphone, Share2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TargetChannel } from '../../approvalQueue/types';

const iconMap: Record<TargetChannel, LucideIcon> = {
  blog: FileText,
  email: Mail,
  social: Share2,
  linkedin: Linkedin,
  instagram: Instagram,
  battlecard: Megaphone,
  other: FileText,
};

interface ChannelIconProps {
  channel: TargetChannel;
  className?: string;
}

export function ChannelIcon({ channel, className }: ChannelIconProps) {
  const Icon = iconMap[channel] ?? FileText;
  return <Icon className={cn('w-4 h-4 shrink-0', className)} aria-hidden />;
}

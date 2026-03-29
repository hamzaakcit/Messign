import type { ReactNode } from 'react';
import type { ContentItem } from '@/lib/marketingApi';
import { isEmailContentItem } from '../lib/contentEmailGuards';
import { ContentEmailUnlayerControls } from './ContentEmailUnlayerControls';

/**
 * Shared email builder entry for Marketing page and Cockpit detail panels (single guard + controls).
 */
export function ContentEmailSection({
  content,
  onUpdated,
  surface = 'page',
  onAskDoraRegenerate,
}: {
  content: ContentItem;
  onUpdated: () => void | Promise<void>;
  surface?: 'page' | 'cockpit';
  onAskDoraRegenerate?: (message: string) => void;
}): ReactNode {
  if (!isEmailContentItem(content)) return null;
  return (
    <ContentEmailUnlayerControls
      content={content}
      onUpdated={onUpdated}
      surface={surface}
      onAskDoraRegenerate={onAskDoraRegenerate}
    />
  );
}

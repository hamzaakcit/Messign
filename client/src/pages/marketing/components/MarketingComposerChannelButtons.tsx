import { Instagram, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MarketingChannelAgentModalId } from '@/pages/marketing/lib/marketingChannelAgentBuilders';
import { MARKETING_COMPOSER_QUICK_ACTIONS } from '@/pages/marketing/components/marketingDoraQuickActions';
import { MarketingDoraQuickActionIcon } from '@/pages/marketing/components/MarketingDoraQuickActionIcon';

const INSTAGRAM_TITLE = 'Instagram post — start a new offer: product, picture and words in five steps.';
const WHATSAPP_TITLE = 'WhatsApp message — describe the audience and the offer, and Lucy drafts a short template.';

/** Shared glass base so every tile reads “designed,” not flat. */
const CHANNEL_TILE_BASE =
  'border bg-gradient-to-b from-slate-900/85 to-slate-950/95 shadow-sm shadow-black/20 hover:brightness-110';

/** The Email tile opens the email brief. Its layouts (newsletter, flash sale, event invite) are chosen in that form. */
function quickActionIdToModalChannel(id: string): MarketingChannelAgentModalId | null {
  return id === 'email' ? 'email' : null;
}

export interface MarketingComposerChannelButtonsProps {
  isLoading: boolean;
  onOpenInstagram: () => void;
  /** Opens the structured Lucy brief modal (email). */
  onOpenChannelModal: (channel: MarketingChannelAgentModalId) => void;
  /**
   * `comfortable`: wrapped grid with helper copy (Lucy rail / wide surfaces).
   * `compact`: single horizontal scroll row (drawer / narrow rails).
   */
  variant?: 'comfortable' | 'compact';
}

/**
 * Instagram goes to New offer. Email and WhatsApp open a brief.
 */
export function MarketingComposerChannelButtons({
  isLoading,
  onOpenInstagram,
  onOpenChannelModal,
  variant = 'comfortable',
}: MarketingComposerChannelButtonsProps): JSX.Element {
  const compact = variant === 'compact';

  const instagramButton = (
    <button
      type="button"
      disabled={isLoading}
      onClick={onOpenInstagram}
      title={INSTAGRAM_TITLE}
      aria-label={INSTAGRAM_TITLE}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg font-medium text-app-text transition disabled:opacity-40',
        CHANNEL_TILE_BASE,
        'border-pink-500/35 from-pink-950/40 to-rose-950/50 ring-1 ring-pink-500/15',
        compact
          ? 'shrink-0 snap-start px-1.5 py-1 text-[9px] font-semibold min-w-[4rem] max-h-9'
          : 'min-h-[2.75rem] w-full justify-center px-2.5 py-2 text-xs sm:text-sm',
      )}
    >
      <Instagram className={cn('shrink-0', compact ? 'w-3 h-3' : 'w-4 h-4 text-pink-300')} />
      <span className={cn('leading-tight', compact && 'truncate max-w-[3.5rem]')}>
        {compact ? 'Insta' : 'Instagram'}
      </span>
    </button>
  );

  const whatsappButton = (
    <button
      type="button"
      disabled={isLoading}
      onClick={() => onOpenChannelModal('whatsapp')}
      title={WHATSAPP_TITLE}
      aria-label={WHATSAPP_TITLE}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg font-medium text-app-text transition disabled:opacity-40',
        CHANNEL_TILE_BASE,
        'border-[#25D366]/40 from-emerald-950/50 to-green-950/40 ring-1 ring-[#25D366]/20',
        compact
          ? 'shrink-0 snap-start px-1.5 py-1 text-[9px] font-semibold min-w-[4rem] max-h-9'
          : 'min-h-[2.75rem] w-full justify-center px-2 py-2 text-xs sm:text-sm',
      )}
    >
      <MessageCircle className={cn('shrink-0', compact ? 'w-3 h-3' : 'w-4 h-4 text-[#25D366]')} />
      <span className={cn('leading-tight', compact && 'truncate max-w-[4.25rem]')}>WhatsApp</span>
    </button>
  );

  const templateButtons = MARKETING_COMPOSER_QUICK_ACTIONS.map((q) => (
    <button
      key={q.id}
      type="button"
      disabled={isLoading}
      title={q.hint}
      aria-label={`${q.label}. ${q.hint}`}
      onClick={() => {
        const ch = quickActionIdToModalChannel(q.id);
        if (ch) onOpenChannelModal(ch);
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg font-medium text-app-text/95 transition disabled:opacity-40',
        CHANNEL_TILE_BASE,
        q.accent,
        q.upgraded && 'ring-1 ring-violet-400/15',
        compact
          ? 'shrink-0 snap-start px-1.5 py-1 text-[9px] font-semibold min-w-[4rem] max-h-9'
          : 'min-h-[2.75rem] w-full justify-center px-2 py-2 text-xs sm:text-sm',
      )}
    >
      <MarketingDoraQuickActionIcon icon={q.icon} size={compact ? 'sm' : 'md'} />
      <span
        className={cn(
          'min-w-0 leading-tight text-left',
          compact ? 'truncate max-w-[3.5rem]' : 'truncate',
        )}
      >
        {q.label}
      </span>
    </button>
  ));

  if (compact) {
    return (
      <div className="flex gap-0.5 overflow-x-auto max-h-[2.75rem] items-center snap-x scrollbar-thin [-webkit-overflow-scrolling:touch] pb-0.5">
        {instagramButton}
        {templateButtons}
        {whatsappButton}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">Templates</p>
      <div className="grid grid-cols-3 gap-1.5">
        {instagramButton}
        {templateButtons}
        {whatsappButton}
      </div>
    </div>
  );
}

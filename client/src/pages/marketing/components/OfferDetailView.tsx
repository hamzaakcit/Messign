/**
 * The offer on the content slide-over: one card, the still large, the caption, and the journey email.
 */

import type { ContentItem } from '@/lib/marketingApi';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { OverflowMenu, type OverflowMenuItem } from '@/components/ui/OverflowMenu';
import { instagramFormatFromTags } from '../lib/instagramFormat';
import { journeyEmailSummary } from '../lib/journeyEmailSummary';
import { offerReviewAction } from '../lib/offerReview';
import { readStudioSheet, STILL_LOOKS } from '../lib/offerSheetForm';
import { OfferSheetDetail } from './OfferSheetDetail';

const FRAME_LABEL: Record<'feed' | 'story' | 'reel', string> = {
  feed: 'Feed (1:1 square)',
  story: 'Story (9:16)',
  reel: 'Reel cover (9:16)',
};

export interface OfferDetailViewProps {
  offer: ContentItem;
  instagram: ContentItem | null;
  email?: ContentItem | null;
  /** When false, the screen says publish is off and shows no share button. */
  publishAllowed: boolean;
  brandName: string;
  /** Regenerates the still with the look saved on the offer. */
  onRegenerate?: () => void;
  regenerating?: boolean;
  /** Sends the post (or, for a cart offer, the email) to review. Never schedules or posts. */
  onLooksGood?: (childId: string) => void;
  /** Shown to a manager or admin when the post is in review. */
  onApprove?: (childId: string) => void;
  canApprove?: boolean;
  submitting?: boolean;
  onOpenChild?: (childId: string) => void;
  onDraftJourneyEmail?: () => void;
  draftingEmail?: boolean;
  /** The model writes the post's caption from the offer sheet. Offered while the post is a draft. */
  onWriteCaption?: (postId: string) => void;
  writingCaption?: boolean;
}

/**
 * Offer, still, caption and journey email on the shop-window card. One primary action ("Looks good");
 * everything else is under `⋯`. No score, hashtags, timing, or access token.
 */
export function OfferDetailView({
  offer,
  instagram,
  email = null,
  publishAllowed,
  brandName,
  onRegenerate,
  regenerating = false,
  onLooksGood,
  onApprove,
  canApprove = false,
  submitting = false,
  onOpenChild,
  onDraftJourneyEmail,
  draftingEmail = false,
  onWriteCaption,
  writingCaption = false,
}: OfferDetailViewProps): JSX.Element {
  const pictureBrief = instagram?.user_brief || offer.user_brief;
  const sheet = readStudioSheet(pictureBrief);
  const still = instagram?.image_url || offer.image_url;
  const caption = (instagram?.body || offer.body || '').trim();
  /** An email-only offer (cart, or an occasion without a post) has no still and no caption to wait for. */
  const hasPost = Boolean(instagram);
  const product = sheet.product || offer.title;
  const look = STILL_LOOKS.find((row) => row.id === sheet.style) ?? STILL_LOOKS[0];
  const frame = FRAME_LABEL[instagramFormatFromTags(instagram?.tags) ?? 'feed'];
  const review = offerReviewAction(instagram, email, canApprove && Boolean(onApprove));
  const mail = email ? journeyEmailSummary(email) : null;
  const reference = instagram?.reference_image_url ?? offer.reference_image_url;

  const menu: OverflowMenuItem[] = [];
  if (instagram && onOpenChild) menu.push({ label: 'Open Instagram post', onSelect: () => onOpenChild(instagram.id) });
  if (email && onOpenChild) menu.push({ label: 'Open email', onSelect: () => onOpenChild(email.id) });
  if (!email && onDraftJourneyEmail) {
    menu.push({ label: draftingEmail ? 'Drafting email…' : 'Draft journey email', onSelect: onDraftJourneyEmail, disabled: draftingEmail });
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-[#f4efe8] p-6 text-[#1c1917]" data-testid="offer-detail">
      <article className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-[#e7e0d6] bg-white">
        <header className="flex items-start justify-between gap-3 p-5 pb-4">
          <div className="min-w-0">
            <h3 className="text-2xl font-medium">{product}</h3>
            {sheet.price ? <p className="mt-1 text-sm text-[#78716c]">{sheet.price}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onLooksGood ? (
              <button
                type="button"
                disabled={review.disabled || submitting}
                title={review.reason ?? undefined}
                onClick={() => {
                  if (!review.targetId) return;
                  if (review.kind === 'approve') onApprove?.(review.targetId);
                  else onLooksGood(review.targetId);
                }}
                className="rounded-lg bg-[#1c1917] px-4 py-2 text-sm font-medium text-white hover:bg-[#292524] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? 'Sending…' : review.label}
              </button>
            ) : null}
            <OverflowMenu items={menu} />
          </div>
        </header>

        {still ? (
          <img src={still} alt="" className="aspect-[4/5] w-full object-cover" />
        ) : hasPost ? (
          <div className="flex aspect-[4/5] items-center justify-center bg-[#f4efe8] text-sm text-[#78716c]">
            No still yet
          </div>
        ) : null}

        <div className="space-y-4 p-5">
          {hasPost || caption ? (
            <p className="whitespace-pre-wrap text-sm leading-6">{caption || 'No caption yet.'}</p>
          ) : null}
          {instagram && onWriteCaption && (instagram.status ?? 'draft') === 'draft' ? (
            <button
              type="button"
              className="text-sm underline underline-offset-2 disabled:opacity-40"
              disabled={writingCaption}
              onClick={() => onWriteCaption(instagram.id)}
            >
              {writingCaption ? 'Writing' : caption ? 'Rewrite caption' : 'Write caption'}
            </button>
          ) : null}
          {instagram ? (
            <div className="space-y-2 text-sm">
              <p>Look: {look.label}</p>
              <p>Frame: {frame}</p>
              {reference ? (
                <p className="flex items-center gap-1 text-xs text-[#78716c]">
                  Reference photo attached <InfoTooltip helpId="ultraReference" />
                </p>
              ) : null}
              {sheet.scene ? (
                <p className="text-xs text-[#78716c]" data-testid="scene-line">
                  {sheet.scene}
                </p>
              ) : null}
              {onRegenerate ? (
                <button type="button" className="text-sm underline underline-offset-2" disabled={regenerating} onClick={onRegenerate}>
                  {still ? (regenerating ? 'Regenerating' : 'Regenerate') : regenerating ? 'Making still' : 'Make still'}
                </button>
              ) : null}
            </div>
          ) : null}

          {mail ? (
            <section className="rounded-xl border border-[#e7e0d6] p-4 text-sm" data-testid="journey-email">
              <h4 className="text-xs font-medium uppercase tracking-wider text-[#78716c]">Journey email</h4>
              <p className="mt-2 font-medium">{mail.subject || 'No subject yet'}</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[#44403c]">
                {mail.product ? (<><dt className="text-[#78716c]">Product</dt><dd>{mail.product}</dd></>) : null}
                {mail.price ? (<><dt className="text-[#78716c]">Price</dt><dd>{mail.price}</dd></>) : null}
                {mail.window ? (<><dt className="text-[#78716c]">Window</dt><dd>{mail.window}</dd></>) : null}
                <dt className="text-[#78716c]">Unsubscribe</dt>
                <dd data-testid="journey-email-unsubscribe">{mail.hasUnsubscribe ? 'Included' : 'Missing: add it before review'}</dd>
              </dl>
            </section>
          ) : null}

          <OfferSheetDetail
            tone="paper"
            hideScene={!hasPost}
            brief={offer.user_brief || instagram?.user_brief}
            returnedPrompt={instagram?.image_generation_metadata?.fal_returned_prompt ?? offer.image_generation_metadata?.fal_returned_prompt}
            referenceImageUrl={reference}
          />
          {publishAllowed ? null : (
            <p className="text-xs text-[#78716c]" data-testid="publish-off">
              Publish is off for {brandName}.
            </p>
          )}
        </div>
      </article>
    </div>
  );
}

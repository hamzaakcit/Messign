/**
 * The offer on the content slide-over: one card, the still large, then the caption.
 */

import type { ContentItem } from '@/lib/marketingApi';
import { instagramFormatFromTags } from '../lib/instagramFormat';
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
  /** When false, the screen says publish is off and shows no share button. */
  publishAllowed: boolean;
  brandName: string;
  /** Regenerates the still with the look saved on the offer. */
  onRegenerate?: () => void;
  regenerating?: boolean;
}

/**
 * Offer, still, and caption on the shop-window card.
 * No score, hashtags, timing, or access token.
 */
export function OfferDetailView({
  offer,
  instagram,
  publishAllowed,
  brandName,
  onRegenerate,
  regenerating = false,
}: OfferDetailViewProps): JSX.Element {
  const pictureBrief = instagram?.user_brief || offer.user_brief;
  const sheet = readStudioSheet(pictureBrief);
  const still = instagram?.image_url || offer.image_url;
  const caption = (instagram?.body || offer.body || '').trim();
  const product = sheet.product || offer.title;
  const look = STILL_LOOKS.find((row) => row.id === sheet.style) ?? STILL_LOOKS[0];
  const frame = FRAME_LABEL[instagramFormatFromTags(instagram?.tags) ?? 'feed'];

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-[#f4efe8] p-6 text-[#1c1917]" data-testid="offer-detail">
      <article className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-[#e7e0d6] bg-white">
        {still ? (
          <img src={still} alt="" className="aspect-[4/5] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center bg-[#f4efe8] text-sm text-[#78716c]">
            No still yet
          </div>
        )}
        <div className="space-y-3 p-5">
          <div>
            <h3 className="text-2xl font-medium">{product}</h3>
            {sheet.price ? <p className="mt-1 text-sm text-[#78716c]">{sheet.price}</p> : null}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6">{caption || 'No caption yet.'}</p>
          {instagram ? (
            <div className="space-y-2 text-sm">
              <p>Look: {look.label}</p>
              <p>Frame: {frame}</p>
              <p className="text-xs text-[#78716c]">
                Ultra keeps what is inside this photo. A counter that is not in the frame cannot be added by a higher strength.
              </p>
              {sheet.scene ? (
                <p className="text-xs text-[#78716c]" data-testid="scene-line">
                  {sheet.scene}
                </p>
              ) : null}
              {onRegenerate ? (
                <button type="button" className="text-sm" disabled={regenerating} onClick={onRegenerate}>
                  {regenerating ? 'Regenerating' : 'Regenerate'}
                </button>
              ) : null}
            </div>
          ) : null}
          <OfferSheetDetail
            tone="paper"
            brief={offer.user_brief || instagram?.user_brief}
            returnedPrompt={instagram?.image_generation_metadata?.fal_returned_prompt ?? offer.image_generation_metadata?.fal_returned_prompt}
            referenceImageUrl={instagram?.reference_image_url ?? offer.reference_image_url}
          />
          {publishAllowed ? null : (
            <p className="text-xs text-[#78716c]" data-testid="publish-off">
              Publish is off for {brandName}. Connect Instagram to share this post.
            </p>
          )}
        </div>
      </article>
    </div>
  );
}

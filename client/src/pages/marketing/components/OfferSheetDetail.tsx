/**
 * Sheet, Fal scene, and the prompt Fal returned, on the content detail panel.
 */

import { readStudioSheet } from '../lib/offerSheetForm';

export interface OfferSheetDetailProps {
  brief?: string | null;
  returnedPrompt?: string | null;
  referenceImageUrl?: string | null;
  /** Paper sits on the shop-window card. The default stays on the dark detail. */
  tone?: 'ink' | 'paper';
}

/**
 * Shows the saved sheet. A reference photo is the Ultra path.
 */
export function OfferSheetDetail({
  brief,
  returnedPrompt,
  referenceImageUrl,
  tone = 'ink',
}: OfferSheetDetailProps): JSX.Element | null {
  const sheet = readStudioSheet(brief);
  const returned = returnedPrompt?.trim() ?? '';
  const hasSheet = Boolean(sheet.product || sheet.place || sheet.price || sheet.claim || sheet.scene);
  if (!hasSheet && !returned && !referenceImageUrl) return null;
  const paper = tone === 'paper';

  return (
    <section
      className={paper
        ? 'space-y-2 border-t border-[#e7e0d6] pt-3 text-xs text-[#44403c]'
        : 'space-y-2 rounded-xl border border-white/[0.08] bg-app-surface-tertiary p-3 text-xs'}
      data-testid="offer-sheet-detail"
    >
      <p className={paper ? 'font-medium text-[#1c1917]' : 'font-medium text-app-text'}>Offer sheet</p>
      {sheet.product ? <p>Product: {sheet.product}</p> : null}
      {sheet.place ? <p>Place: {sheet.place}</p> : null}
      {sheet.price ? <p>Price: {sheet.price}</p> : null}
      {sheet.claim ? <p>Claim: {sheet.claim}</p> : null}
      {sheet.scene ? (
        <p>
          <span className={paper ? 'text-[#78716c]' : 'text-app-muted'}>Scene sent to Fal: </span>
          {sheet.scene}
        </p>
      ) : null}
      {returned ? (
        <p>
          <span className={paper ? 'text-[#78716c]' : 'text-app-muted'}>Prompt Fal returned: </span>
          {returned}
        </p>
      ) : null}
      {referenceImageUrl ? <p data-testid="ultra-path">Ultra path</p> : null}
    </section>
  );
}

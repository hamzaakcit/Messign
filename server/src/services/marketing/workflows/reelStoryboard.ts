/**
 * Reel package for this track: a cover still prompt plus a storyboard.
 * Story frames are on-screen text in a 9:16 frame. No video bytes.
 */

import type { OfferSheet } from '../offerSheet.js';

export interface ReelShot {
  shot: string;
  onScreen: string;
}

export interface ReelPackage {
  coverPrompt: string;
  hook: string;
  shots: ReelShot[];
  caption: string;
  audioNote: string;
}

export interface StoryFramePackage {
  frames: string[];
  aspectRatio: '9:16';
}

const IMAGE_BLOCK = /\[IMAGE_PROMPT\]([\s\S]*?)\[\/IMAGE_PROMPT\]/i;
const STORY_BLOCK = /\[STORYBOARD\]([\s\S]*?)\[\/STORYBOARD\]/i;

/**
 * Read a cover prompt and three to six shots from a strategist draft.
 * Returns null when the storyboard is missing or the shot count is out of range.
 */
export function parseReelPackage(draft: string): ReelPackage | null {
  const cover = draft.match(IMAGE_BLOCK)?.[1]?.trim() ?? '';
  const story = draft.match(STORY_BLOCK)?.[1];
  if (!cover || !story) return null;

  let hook = '';
  let caption = '';
  let audioNote = '';
  const shots: ReelShot[] = [];
  let pendingShot: string | null = null;

  for (const rawLine of story.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const splitAt = line.indexOf(':');
    if (splitAt <= 0) continue;
    const key = line.slice(0, splitAt).trim().toLowerCase().replace(/\s+/g, '_');
    const value = line.slice(splitAt + 1).trim();
    if (!value) continue;
    if (key === 'hook') hook = value;
    else if (key === 'caption') caption = value;
    else if (key === 'audio' || key === 'audio_note') audioNote = value;
    else if (key === 'shot') {
      if (pendingShot) shots.push({ shot: pendingShot, onScreen: '' });
      pendingShot = value;
    } else if (key === 'on_screen' || key === 'onscreen') {
      if (pendingShot) {
        shots.push({ shot: pendingShot, onScreen: value });
        pendingShot = null;
      }
    }
  }
  if (pendingShot) shots.push({ shot: pendingShot, onScreen: '' });

  if (!hook || !caption || !audioNote) return null;
  if (shots.length < 3 || shots.length > 6) return null;
  return { coverPrompt: cover, hook, shots, caption, audioNote };
}

/**
 * Write the package back to the draft blocks. A two-shot list does not save.
 */
export function saveReelPackage(pack: ReelPackage): string | null {
  if (pack.shots.length < 3 || pack.shots.length > 6) return null;
  if (!pack.coverPrompt.trim() || !pack.hook.trim() || !pack.caption.trim() || !pack.audioNote.trim()) return null;
  if (pack.shots.some((shot) => !shot.shot.trim())) return null;
  const lines = [
    '[IMAGE_PROMPT]',
    pack.coverPrompt.trim(),
    '[/IMAGE_PROMPT]',
    '[STORYBOARD]',
    `hook: ${pack.hook.trim()}`,
    ...pack.shots.flatMap((shot) => [`shot: ${shot.shot.trim()}`, `on_screen: ${shot.onScreen.trim()}`]),
    `caption: ${pack.caption.trim()}`,
    `audio: ${pack.audioNote.trim()}`,
    '[/STORYBOARD]',
  ];
  return lines.join('\n');
}

/**
 * Replace the shot list. Fewer than three shots does not save.
 */
export function replaceReelShots(pack: ReelPackage, shots: readonly ReelShot[]): ReelPackage | null {
  if (shots.length < 3 || shots.length > 6) return null;
  if (shots.some((shot) => !shot.shot.trim())) return null;
  return { ...pack, shots: shots.map((shot) => ({ shot: shot.shot.trim(), onScreen: shot.onScreen.trim() })) };
}

/**
 * Pre-fill a reel from the offer sheet. Shot 1 names the product.
 * The cover prompt names the product and the place. A claim becomes the hook.
 */
export function reelPackageFromSheet(sheet: OfferSheet): ReelPackage {
  const product = sheet.product.trim() || 'the product';
  const place = sheet.place.trim();
  const claim = sheet.claim.trim();
  const where = place ? ` at ${place}` : '';
  return {
    coverPrompt: `Photorealistic photograph of ${product}${where}. Vertical 9:16 frame.`,
    hook: claim || product,
    shots: [
      { shot: `${product} in the opening frame`, onScreen: claim || product },
      { shot: `${product} held in view${where}`, onScreen: place || product },
      { shot: `Hold on ${product}`, onScreen: place || product },
    ],
    caption: place ? `${product} at ${place}.` : `${product}.`,
    audioNote: 'No voiceover.',
  };
}

/**
 * Cover still request for Flux. Vertical frame only. No video file.
 */
export function reelCoverRequest(coverPrompt: string): {
  aspect_ratio: '9:16';
  resolution: '1080x1920';
  prompt: string;
  instagram_feed: true;
} {
  return {
    aspect_ratio: '9:16',
    resolution: '1080x1920',
    prompt: coverPrompt.trim(),
    instagram_feed: true,
  };
}

/**
 * Story frames: 3 to 5 lines of on-screen text, 9:16. Two frames do not save.
 */
export function saveStoryFrames(frames: readonly string[]): StoryFramePackage | null {
  const cleaned = frames.map((frame) => frame.trim()).filter(Boolean);
  if (cleaned.length < 3 || cleaned.length > 5) return null;
  return { frames: cleaned, aspectRatio: '9:16' };
}

/** Text a creator can paste. Includes the cover image URL and each shot. */
export function reelExportText(pack: ReelPackage, imageUrl: string | null | undefined): string {
  const lines = [
    `Cover image: ${imageUrl?.trim() || '(none yet)'}`,
    `Cover prompt: ${pack.coverPrompt}`,
    `Hook: ${pack.hook}`,
    ...pack.shots.map((shot, index) => `${index + 1}. ${shot.shot} — ${shot.onScreen}`),
    `Caption: ${pack.caption}`,
    `Audio: ${pack.audioNote}`,
  ];
  return lines.join('\n');
}

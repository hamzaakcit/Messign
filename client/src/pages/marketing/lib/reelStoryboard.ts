/**
 * Client copy of the reel package parser. The server test is the source of truth.
 * This screen never requests a video file.
 */

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

const IMAGE_BLOCK = /\[IMAGE_PROMPT\]([\s\S]*?)\[\/IMAGE_PROMPT\]/i;
const STORY_BLOCK = /\[STORYBOARD\]([\s\S]*?)\[\/STORYBOARD\]/i;

/** Cover prompt plus three to six shots. Null when the block is absent or out of range. */
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

/** Clipboard text: cover URL, cover prompt, and each shot. */
export function reelExportText(pack: ReelPackage, imageUrl: string | null | undefined): string {
  return [
    `Cover image: ${imageUrl?.trim() || '(none yet)'}`,
    `Cover prompt: ${pack.coverPrompt}`,
    `Hook: ${pack.hook}`,
    ...pack.shots.map((shot, index) => `${index + 1}. ${shot.shot} — ${shot.onScreen}`),
    `Caption: ${pack.caption}`,
    `Audio: ${pack.audioNote}`,
  ].join('\n');
}

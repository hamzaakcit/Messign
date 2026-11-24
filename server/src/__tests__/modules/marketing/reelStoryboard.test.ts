import { describe, expect, it } from 'vitest';
import { parseReelPackage, reelCoverRequest, reelExportText, reelPackageFromSheet, replaceReelShots, saveReelPackage, saveStoryFrames } from '../../../services/marketing/workflows/reelStoryboard.js';
import { emptyOfferSheet } from '../../../services/marketing/offerSheet.js';

const DRAFT = `
[IMAGE_PROMPT]
Bookstore window at dusk, the novel centered on a wooden stand
[/IMAGE_PROMPT]
[STORYBOARD]
hook: Stop on the cover
shot: The novel in the window
on_screen: This week
shot: A page turning
on_screen: Yaşar Kemal
shot: The shop at dusk
on_screen: Kadıköy
caption: İnce Memed is in the window.
audio: Quiet street, no voice
[/STORYBOARD]
`;

describe('reel storyboard', () => {
  it('returns a cover prompt plus three shots', () => {
    const pack = parseReelPackage(DRAFT);
    expect(pack?.coverPrompt).toContain('Bookstore window');
    expect(pack?.shots).toHaveLength(3);
    expect(pack?.shots[0]).toEqual({ shot: 'The novel in the window', onScreen: 'This week' });
    expect(pack?.hook).toBe('Stop on the cover');
    expect(pack?.audioNote).toBe('Quiet street, no voice');
  });

  it('rejects a storyboard with fewer than three shots', () => {
    const short = DRAFT.replace('shot: The shop at dusk\non_screen: Kadıköy\n', '');
    expect(parseReelPackage(short)).toBeNull();
  });

  it('does not save a two-shot reel and round-trips five shots', () => {
    const sheet = emptyOfferSheet();
    sheet.product = 'Kürk Mantolu Madonna';
    sheet.place = 'Karaköy kitapçı vitrini';
    sheet.claim = 'Bu hafta vitrinde';
    const pack = reelPackageFromSheet(sheet);
    expect(pack.coverPrompt).toContain('Kürk Mantolu Madonna');
    expect(pack.coverPrompt).toContain('Karaköy kitapçı vitrini');
    expect(pack.shots[0]?.shot).toContain('Kürk Mantolu Madonna');
    expect(pack.hook).toBe('Bu hafta vitrinde');
    expect(saveReelPackage({ ...pack, shots: pack.shots.slice(0, 2) })).toBeNull();
    expect(replaceReelShots(pack, pack.shots.slice(0, 2))).toBeNull();

    const five = replaceReelShots(pack, [
      ...pack.shots,
      { shot: 'Kürk Mantolu Madonna on the counter', onScreen: 'Look' },
      { shot: 'Kürk Mantolu Madonna leaves the frame', onScreen: 'End' },
    ]);
    expect(five?.shots).toHaveLength(5);
    const saved = five ? saveReelPackage(five) : null;
    expect(saved).toBeTruthy();
    const again = saved ? parseReelPackage(saved) : null;
    expect(again?.shots).toEqual(five?.shots);
    expect(again?.coverPrompt).toContain('Kürk Mantolu Madonna');
    expect(again?.hook).toBe('Bu hafta vitrinde');

    const cover = reelCoverRequest(pack.coverPrompt);
    expect(cover.aspect_ratio).toBe('9:16');
    expect(cover.resolution).toBe('1080x1920');
    expect(cover.prompt).toContain('Kürk Mantolu Madonna');

    const exported = reelExportText(pack, 'https://cdn.example/cover.jpg');
    expect(exported).toContain('Cover image: https://cdn.example/cover.jpg');
    expect(exported).toContain('Hook: Bu hafta vitrinde');
    expect(exported).toContain('Caption:');
    expect(exported).toContain('Audio:');
    expect(exported).not.toMatch(/\.mp4|video bytes/i);
    expect(JSON.stringify(pack)).not.toMatch(/mp4|videoUrl|video_bytes/i);

    expect(saveStoryFrames(['One', 'Two'])).toBeNull();
    expect(saveStoryFrames(['One', 'Two', 'Three', 'Four'])).toEqual({
      frames: ['One', 'Two', 'Three', 'Four'],
      aspectRatio: '9:16',
    });
  });
});

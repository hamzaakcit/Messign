/**
 * Map pixel dimensions to Fal FLUX Kontext `aspect_ratio` enum (closest match).
 * @see https://fal.ai/models/fal-ai/flux-pro/kontext/api
 */
export const FAL_KONTEXT_ASPECT_RATIOS = [
  '21:9',
  '16:9',
  '4:3',
  '3:2',
  '1:1',
  '2:3',
  '3:4',
  '9:16',
  '9:21',
] as const;

export type FalKontextAspectRatio = (typeof FAL_KONTEXT_ASPECT_RATIOS)[number];

function ratioStringToNumber(label: string): number {
  const parts = label.split(':');
  const w = Number(parts[0]);
  const h = Number(parts[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return 1;
  return w / h;
}

/**
 * Picks the Fal Kontext aspect_ratio string whose ratio is closest to width/height (log-space distance).
 */
export function mapDimensionsToFalKontextAspectRatio(width: number, height: number): FalKontextAspectRatio {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '1:1';
  }
  const r = width / height;
  let best: FalKontextAspectRatio = '1:1';
  let bestDiff = Infinity;
  for (const label of FAL_KONTEXT_ASPECT_RATIOS) {
    const t = ratioStringToNumber(label);
    const d = Math.abs(Math.log(r) - Math.log(t));
    if (d < bestDiff) {
      bestDiff = d;
      best = label;
    }
  }
  return best;
}

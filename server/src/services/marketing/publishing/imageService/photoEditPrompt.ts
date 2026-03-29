/**
 * Scene-matching rules so added objects (paper planes, props) look photographed, not like clip-art.
 * Kept compact — Kontext works best with focused instructions under ~8k chars total.
 */
const KONTEXT_REALISM_BLOCK = [
  'REALISM (mandatory): Match this photograph’s existing light direction, softness, and color temperature.',
  'Anti-CG: no low-poly 3D look, no smooth plastic shader, no video-game asset, no uniform flat color fills — the added object must read as photographed matter.',
  'Shadows: plausible contact shadow and ambient occlusion — same penumbra softness as other shadows; shadow shape must follow the object’s silhouette (not a generic round blob).',
  'Materials: real-world micro-texture — folded matte paper with visible fiber, creases, edge thickness — not a vector icon, sticker, emoji, or neon fill.',
  'Lighting: facet-by-facet highlights and shade that follow the scene key light; subtle bounce from ground/walls onto the object.',
  'Camera match: match background sharpness, ISO noise / grain, and depth-of-field — the insert must not look sharper or cleaner than the rest of the frame.',
  'Integration: correct perspective and scale; no hard cut-out edges, halos, or “pasted on top” compositing.',
  'Color: keep saturation in family with the photo — avoid poster primaries and clip-art saturation.',
  'Do not replace the background — only add or change the requested element in-camera.',
].join('\n');

/**
 * Extra lines when the user asks for folded paper / planes — models often default to a flat or low-poly look.
 */
function buildPropSpecificBoost(userInstruction: string): string {
  if (!/\b(paper[\s-]*plane|paper[\s-]*airplanes?|origami|folded\s+paper)\b/i.test(userInstruction.trim())) {
    return '';
  }
  return [
    'PROP (folded paper): Show real folded geometry — separate wing planes, crisp fold lines, slight paper thickness at edges; avoid a single flat shape or toy low-poly model.',
    'Paper surface: faint fiber texture, subtle tonal variation across facets; if white/cream paper, use soft warm/cool shifts from the scene — not flat CGI white.',
    'Grounding: shadow must align with wing outline and body on cobblestones/floor; integrate with existing alley light.',
  ].join('\n');
}

export interface PhotoEditPromptOptions {
  /** Marketing style preset (e.g. photoreal) — adds a short style block after the realism rules. */
  style_preset?: string;
}

/**
 * Optional lines per Instagram/marketing style preset for Kontext additive edits.
 */
function stylePresetBlock(stylePreset: string | undefined): string {
  const p = (stylePreset ?? 'photoreal').trim().toLowerCase().replace(/-/g, '_');
  switch (p) {
    case 'photoreal':
      return [
        'STYLE PRESET (photoreal): Premium documentary still — match white balance, exposure, and lens character to the scene.',
        'Same apparent resolution and detail level as the background: no supersharp “render” insert; no HDR glow or plastic sheen.',
      ].join('\n');
    case 'modern_noir':
      return [
        'STYLE PRESET (modern noir): Deeper shadows, cooler highlights, restrained saturation — but the added object must stay physically grounded with realistic shadows and reflections.',
      ].join('\n');
    case 'vibrant_lifestyle':
      return [
        'STYLE PRESET (vibrant lifestyle): Warm, lively color — but keep the new element photographically integrated (no neon sticker colors).',
      ].join('\n');
    case 'minimal_flat':
      return [
        'STYLE PRESET (minimal flat-lay): Clean, graphic composition only if it matches the scene; otherwise keep natural perspective and shadows.',
      ].join('\n');
    case 'editorial':
      return [
        'STYLE PRESET (editorial): Polished magazine look with cinematic grading — still photoreal, not illustrated.',
      ].join('\n');
    case 'product_spotlight':
      return [
        'STYLE PRESET (product spotlight): Crisp subject read — preserve realistic studio-like falloff only if the scene supports it.',
      ].join('\n');
    case 'team_culture':
    case 'data_viz':
    case 'seasonal':
    case 'ugc_style':
      return [
        'STYLE PRESET: Natural, authentic smartphone or DSLR look — match the candid quality of the reference.',
      ].join('\n');
    default:
      return stylePresetBlock('photoreal');
  }
}

/**
 * Wraps user-facing edit instructions for FLUX Kontext so the model preserves
 * the original real-world photograph while adding composited elements.
 *
 * @param instruction — What to add or change (e.g. "add a small paper plane in the sky").
 * @param options — Optional `style_preset` for extra style lines (defaults to photoreal).
 */
export function buildAdditivePhotoEditPrompt(instruction: string, options?: PhotoEditPromptOptions): string {
  const t = instruction.trim();
  const style = stylePresetBlock(options?.style_preset);
  const propBoost = buildPropSpecificBoost(t);
  const parts = [
    'Edit this photo in place. Keep the same location, lens, and composition — do not replace the scene.',
    KONTEXT_REALISM_BLOCK,
    '',
    style,
  ];
  if (propBoost) {
    parts.push('', propBoost);
  }
  parts.push('', 'USER EDIT:', t);
  const base = parts.join('\n');
  return base.slice(0, 8000);
}

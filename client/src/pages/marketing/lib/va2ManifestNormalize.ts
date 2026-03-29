// ─────────────────────────────────────────────────────────────────────────────
// VA2 manifest content aliases — shared by manifestParser and validateManifest
// (kept separate from designAssembler to avoid circular imports via emailAiDraftToDesign.)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replaces vague CTA labels that match copy-quality kill lists with a neutral alternative.
 * Used by {@link upgradeVagueCtasInRaw} during `validateManifest` before copy-quality checks.
 */
export function replaceVagueCtaLabel(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (/^learn more$/i.test(t)) return 'See details';
  return text;
}

/**
 * Mutates raw manifest sections: upgrades hero `ctaText` and cta `buttonText` when exactly "Learn more".
 */
export function upgradeVagueCtasInRaw(raw: Record<string, unknown>): void {
  const sections = raw.sections;
  if (!Array.isArray(sections)) return;
  for (const sec of sections) {
    if (!sec || typeof sec !== 'object' || Array.isArray(sec)) continue;
    const s = sec as Record<string, unknown>;
    const c = s.content;
    if (!c || typeof c !== 'object' || Array.isArray(c)) continue;
    const content = c as Record<string, unknown>;
    const st = String(s.type);
    if (st === 'cta' && typeof content.buttonText === 'string') {
      content.buttonText = replaceVagueCtaLabel(content.buttonText);
    }
    if (st === 'hero' && typeof content.ctaText === 'string') {
      content.ctaText = replaceVagueCtaLabel(content.ctaText);
    }
  }
}

/**
 * Map common LLM field aliases to keys expected by VA2 block builders (cta, hero).
 */
export function normalizeVa2SectionContent(type: string, content: Record<string, unknown>): Record<string, unknown> {
  const c = { ...content };
  if (type === 'cta') {
    if (!c.buttonText && typeof c.text === 'string') c.buttonText = c.text;
    if (!c.buttonText && typeof c.label === 'string') c.buttonText = c.label;
    if (!c.buttonUrl && typeof c.url === 'string') c.buttonUrl = c.url;
    if (!c.buttonUrl && typeof c.link === 'string') c.buttonUrl = c.link;
    if (!c.buttonUrl && typeof c.href === 'string') c.buttonUrl = c.href;
  }
  if (type === 'hero') {
    const cta = c.cta;
    if (cta && typeof cta === 'object' && !Array.isArray(cta)) {
      const ct = cta as Record<string, unknown>;
      if (!c.ctaText && typeof ct.text === 'string') c.ctaText = ct.text;
      if (!c.ctaUrl && typeof ct.url === 'string') c.ctaUrl = ct.url;
    }
    if (!c.ctaText && typeof c.buttonText === 'string') c.ctaText = c.buttonText;
    if (!c.ctaUrl && typeof c.buttonUrl === 'string') c.ctaUrl = c.buttonUrl;
    if (!c.altText && typeof c.imageAlt === 'string') c.altText = c.imageAlt;
    if (!c.imagePosition && typeof c.backgroundPosition === 'string') c.imagePosition = c.backgroundPosition;
    if (!c.decorativeInitial && typeof c.initialLetter === 'string') c.decorativeInitial = c.initialLetter;
    if (c.watermarkOpacity === undefined && typeof c.watermark_opacity === 'number') {
      c.watermarkOpacity = c.watermark_opacity;
    }
  }
  if (type === 'text_block') {
    if (c.insetCard === undefined && typeof c.inset_card === 'boolean') c.insetCard = c.inset_card;
  }
  return c;
}

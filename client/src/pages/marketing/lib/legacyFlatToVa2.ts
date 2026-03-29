// ─────────────────────────────────────────────────────────────────────────────
// Legacy flat Design Manifest (v1) → Visual Architect v2 DesignManifest
// ─────────────────────────────────────────────────────────────────────────────

import type { ColorTheme } from './types/designManifest.types';
import type {
  DesignManifest as LegacyFlatManifest,
  ManifestSection as LegacySection,
  ManifestHeroSection,
  ManifestHeadlineSection,
  ManifestBodySection,
  ManifestFeatureGridSection,
  ManifestCTASection,
  ManifestImageTextSection,
  ManifestTestimonialSection,
  ManifestSocialSection,
  ManifestFooterSection,
} from './types/designManifest.types';
import type { DesignManifest as Va2DesignManifest, ManifestSection as Va2Section } from './types/manifestTypes';
import type { ThemeName } from './types/designTokenTypes';
import type { ResolvedAssets } from './designAssembler';
import { normalizePreheaderForEmail } from './preheaderNormalize';

/**
 * Map legacy color themes to VA2 theme tokens (closest visual family).
 */
export function legacyColorThemeToVa2Theme(colorTheme: ColorTheme): ThemeName {
  const map: Record<ColorTheme, ThemeName> = {
    messign_blue: 'startup',
    modern_noir: 'tech',
    warm_sunrise: 'warm',
    ocean_breeze: 'nature',
    electric_violet: 'bold',
    forest_green: 'nature',
    soft_pastel: 'minimal',
    glassmorphism: 'luxury',
  };
  return map[colorTheme] ?? 'minimal';
}

function escapeHtmlBody(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

let orderCounter = 0;
function nextOrder(): number {
  orderCounter += 1;
  return orderCounter;
}

function resetOrder(): void {
  orderCounter = 0;
}

/**
 * Convert a validated legacy flat manifest and optional resolved image assets into a VA2 DesignManifest.
 */
export function legacyFlatManifestToVa2(
  legacy: LegacyFlatManifest,
  assets: ResolvedAssets = {},
): Va2DesignManifest {
  resetOrder();
  const subject = (legacy.meta.subject as string | undefined)?.trim() || 'Email';
  const rawPre = (legacy.meta.preheader as string | undefined)?.trim() || subject;
  const preheader = normalizePreheaderForEmail(rawPre, subject);
  const theme = legacyColorThemeToVa2Theme(legacy.colorTheme);

  const sections: Va2Section[] = [];

  let imageTextIdx = 0;
  for (const sec of legacy.sections) {
    const converted = legacySectionToVa2(sec, assets, imageTextIdx);
    if (sec.type === 'image-text') imageTextIdx += 1;
    if (converted.length === 0) continue;
    sections.push(...converted);
  }

  const out: Va2DesignManifest = {
    version: '2.0',
    theme,
    subject,
    preheader,
    sections,
    metadata: {
      channel: 'email',
      tone: '',
      audience: '',
      assembly_source: 'legacy_flat_bridge',
    },
    artDirection: {
      imageStyle: legacy.visualStyle,
      colorNotes: `legacy layout=${legacy.layout} density=${legacy.layoutDensity ?? 'normal'}`,
    },
  };

  if (legacy.easterEgg === 'paper_plane') {
    out.motionOverlay = 'paper_plane_sweep';
    out.overlayIntensity = 'signature';
    out.easterEgg = 'paper_plane';
  }

  return out;
}

function legacySectionToVa2(
  sec: LegacySection,
  assets: ResolvedAssets,
  imageTextIndex: number,
): Va2Section[] {
  switch (sec.type) {
    case 'hero': {
      const h = sec as ManifestHeroSection;
      const cta = h.cta;
      const content: Record<string, unknown> = {
        headline: h.headline ?? 'Welcome',
        subheadline: h.subheadline,
        alignment: h.alignment ?? 'center',
        imagePrompt: h.imagePrompt,
      };
      if (assets.heroImageUrl) content.imageUrl = assets.heroImageUrl;
      if (cta) {
        content.ctaText = cta.text;
        content.ctaUrl = cta.url;
      }
      return [
        {
          type: 'hero',
          order: nextOrder(),
          content,
        },
      ];
    }
    case 'headline': {
      const h = sec as ManifestHeadlineSection;
      const text = h.text ?? '';
      const body = `<h2 style="margin:0 0 8px 0;font-weight:700;">${escapeHtmlBody(text)}</h2>`;
      return [
        {
          type: 'text_block',
          order: nextOrder(),
          content: {
            body,
            alignment: h.alignment ?? 'center',
          },
        },
      ];
    }
    case 'body': {
      const b = sec as ManifestBodySection;
      return [
        {
          type: 'text_block',
          order: nextOrder(),
          content: {
            body: escapeHtmlBody(b.text ?? '').replace(/\n/g, '<br/>'),
            alignment: b.alignment ?? 'left',
          },
        },
      ];
    }
    case 'feature-grid': {
      const g = sec as ManifestFeatureGridSection;
      const colN = g.columns || 3;
      const columns = colN >= 3 ? 3 : 2;
      const items = (g.items ?? []).map((it, i) => ({
        icon: 'Sparkles',
        heading: it.title,
        description: it.description,
        imageUrl: assets.featureImageUrls?.[i],
        imagePrompt: it.imagePrompt,
      }));
      return [
        {
          type: 'value_prop',
          order: nextOrder(),
          content: {
            columns,
            items,
          },
        },
      ];
    }
    case 'cta': {
      const c = sec as ManifestCTASection;
      return [
        {
          type: 'cta',
          order: nextOrder(),
          content: {
            buttonText: c.text,
            buttonUrl: c.url,
            variant: mapCtaStyle(c.style),
          },
        },
      ];
    }
    case 'divider': {
      return [
        {
          type: 'divider',
          order: nextOrder(),
          content: {},
        },
      ];
    }
    case 'image-text': {
      const it = sec as ManifestImageTextSection;
      const layout =
        it.imagePosition === 'right' ? 'image_right' : it.imagePosition === 'left' ? 'image_left' : 'image_top';
      const loose = it as Record<string, unknown>;
      const bodySrc =
        typeof it.text === 'string'
          ? it.text
          : typeof loose.description === 'string'
            ? loose.description
            : '';
      const content: Record<string, unknown> = {
        headline: it.title,
        body: escapeHtmlBody(bodySrc).replace(/\n/g, '<br/>'),
        layout,
        imagePrompt: it.imagePrompt,
      };
      const url = assets.imageTextUrls?.[imageTextIndex];
      if (url) content.imageUrl = url;
      if (it.cta) {
        content.ctaText = it.cta.text;
        content.ctaUrl = it.cta.url;
      }
      return [
        {
          type: 'image_text',
          order: nextOrder(),
          content,
        },
      ];
    }
    case 'testimonial': {
      const t = sec as ManifestTestimonialSection;
      const attribution = t.attribution ?? t.author;
      return [
        {
          type: 'testimonial',
          order: nextOrder(),
          content: {
            quote: t.quote ?? '',
            authorName: attribution ?? 'Customer',
            authorRole: t.role,
            authorCompany: t.company,
          },
        },
      ];
    }
    case 'social': {
      const s = sec as ManifestSocialSection;
      const platforms = s.platforms ?? [];
      const links = platforms
        .map(
          (p) =>
            `<a href="${escapeHtmlBody(p.url)}" style="color:inherit;text-decoration:underline">${escapeHtmlBody(p.name)}</a>`,
        )
        .join(' &nbsp;·&nbsp; ');
      return [
        {
          type: 'text_block',
          order: nextOrder(),
          content: {
            body: `<p style="text-align:center;margin:0;font-size:15px">${links}</p>`,
            alignment: 'center',
          },
        },
      ];
    }
    case 'footer': {
      const f = sec as ManifestFooterSection;
      return [
        {
          type: 'footer',
          order: nextOrder(),
          content: {
            companyName: f.companyName ?? 'Company',
            address: f.address ?? '',
            links: f.unsubscribeUrl
              ? [{ text: 'Unsubscribe', url: f.unsubscribeUrl }]
              : undefined,
          },
        },
      ];
    }
    default:
      return [];
  }
}

function mapCtaStyle(
  style: ManifestCTASection['style'] | undefined,
): 'pill' | 'ghost' | 'fullWidth' {
  if (style === 'ghost') return 'ghost';
  if (style === 'fullWidth') return 'fullWidth';
  return 'pill';
}

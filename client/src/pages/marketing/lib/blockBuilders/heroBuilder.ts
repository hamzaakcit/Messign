import type {
  UnlayerRow as Va2UnlayerRow,
  UnlayerContent as Va2UnlayerContent,
} from '../types/unlayerTypes';
import type { HeroContent } from '../types/manifestTypes';
import type { DesignTheme } from '../types/designTokenTypes';
import { generateId, adjustBrightness, buildHeroOverlayGradient, getPremiumEffects } from '../designTokens';
import { createSingleColumnRow } from './va2Shared';
import type { BlockBuilderOptions } from './types';

/**
 * Build the preheader row — hidden preview text for email clients.
 * This MUST be the first row in every assembled email.
 */
export function buildPreheader(
  content: { text: string },
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const preheaderText = content.text || 'Preview this email in your browser';

  const padding = Array(75).fill('&zwnj;&nbsp;').join('');

  const htmlContent: Va2UnlayerContent = {
    id: generateId('content'),
    type: 'html',
    values: {
      html: [
        '<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;',
        'max-height:0px;max-width:0px;opacity:0;overflow:hidden;">',
        preheaderText,
        padding,
        '</div>',
      ].join(''),
      hideDesktop: false,
      hideMobile: false,
      containerPadding: '0px',
      anchor: '',
      _meta: { htmlID: '', htmlClassNames: 'preheader' },
    },
  };

  return [
    createSingleColumnRow([htmlContent], theme, {
      backgroundColor: theme.colors.background,
      padding: '0px',
      className: 'preheader-row',
    }),
  ];
}

/**
 * Build the hero section — the eye-catching header of the email.
 *
 * v2 Pro upgrades:
 * - Gradient scrim overlay on hero images (theme-aware: linear, radial, or mesh)
 * - Premium letter-spacing on headlines
 * - Text shadow for readability over images
 * - Support for badge/tag above headline
 * - Enhanced CTA with subtle shadow
 * - More cinematic padding ratios
 */
export function buildHeroSection(
  content: HeroContent,
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const spacing = theme.spacing;
  const typo = theme.typography;
  const effects = getPremiumEffects(theme);
  const align = content.alignment ?? 'center';

  const heroFontSize =
    content.headline.length > 80 ? Math.round(typo.hero.fontSize * 0.8) : typo.hero.fontSize;

  const hasImage = Boolean(content.imageUrl);
  const overlayGradient = buildHeroOverlayGradient(theme);

  // Build inner HTML with gradient scrim for images
  const contents: Va2UnlayerContent[] = [];

  // ── Optional badge/tag above headline ──
  const badge = (content as Record<string, unknown>).badge as string | undefined;
  if (badge) {
    contents.push({
      id: generateId('content'),
      type: 'html',
      values: {
        html: `<div style="text-align:${align};padding:0 0 ${spacing.sm}px"><span style="display:inline-block;background:${theme.colors.accent};color:#FFFFFF;font-family:${typo.caption.fontFamily};font-size:${typo.caption.fontSize}px;font-weight:700;padding:4px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:1px">${badge}</span></div>`,
        hideDesktop: false,
        hideMobile: false,
        containerPadding: '0px',
        anchor: '',
        _meta: { htmlID: '', htmlClassNames: 'hero-badge' },
      },
    });
  }

  // ── Headline with text shadow for image readability ──
  const textShadow = hasImage ? 'text-shadow:0 2px 8px rgba(0,0,0,0.4);' : '';
  const letterSpacingVal = typo.hero.letterSpacing !== undefined ? typo.hero.letterSpacing : -0.5;

  contents.push({
    id: generateId('content'),
    type: 'heading',
    values: {
      text: content.headline,
      headingType: 'h1',
      fontFamily: {
        label: typo.hero.fontFamily.split(',')[0].trim(),
        value: typo.hero.fontFamily,
      },
      fontSize: `${heroFontSize}px`,
      fontWeight: typo.hero.fontWeight,
      textAlign: align,
      lineHeight: `${Math.round(typo.hero.lineHeight * 100)}%`,
      letterSpacing: `${letterSpacingVal}px`,
      textTransform: typo.hero.textTransform ?? 'none',
      color: '#FFFFFF',
      containerPadding: `${spacing.xl}px ${spacing.lg}px ${content.subheadline ? spacing.xs : spacing.md}px`,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'hero-headline', extraStyle: textShadow },
    },
  });

  // ── Subheadline ──
  if (content.subheadline) {
    contents.push({
      id: generateId('content'),
      type: 'text',
      values: {
        text: `<p style="font-size:${typo.subheading.fontSize}px;color:rgba(255,255,255,0.92);text-align:${align};line-height:${Math.round(typo.subheading.lineHeight * 100)}%;font-family:${typo.subheading.fontFamily};${textShadow}">${content.subheadline}</p>`,
        containerPadding: `${spacing.xs}px ${spacing.lg}px ${content.ctaText ? spacing.md : spacing.lg}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'hero-subheadline' },
      },
    });
  }

  // ── CTA button with optional glow/shadow ──
  if (content.ctaText) {
    const ctaShadow = effects.ctaGlow
      ? `box-shadow:0 4px 16px ${theme.colors.accentGlow ?? 'rgba(0,0,0,0.15)'};`
      : '';

    contents.push({
      id: generateId('content'),
      type: 'button',
      values: {
        text: content.ctaText,
        href: {
          name: 'web',
          values: { href: content.ctaUrl ?? '#', target: '_blank' },
        },
        buttonColors: {
          color: theme.colors.ctaText,
          backgroundColor: theme.colors.ctaPrimary,
          hoverColor: theme.colors.ctaText,
          hoverBackgroundColor: adjustBrightness(theme.colors.ctaPrimary, -15),
        },
        size: { autoWidth: true, width: '100%' },
        padding: `${spacing.sm + 2}px ${spacing.lg + 8}px`,
        borderRadius: `${Math.max(theme.borderRadius, 8)}px`,
        fontFamily: {
          label: typo.cta.fontFamily.split(',')[0].trim(),
          value: typo.cta.fontFamily,
        },
        fontSize: `${typo.cta.fontSize}px`,
        fontWeight: typo.cta.fontWeight,
        textAlign: 'center',
        lineHeight: `${Math.round(typo.cta.lineHeight * 100)}%`,
        letterSpacing: typo.cta.letterSpacing !== undefined ? `${typo.cta.letterSpacing}px` : undefined,
        textTransform: typo.cta.textTransform ?? 'none',
        containerPadding: `${spacing.sm}px ${spacing.lg}px ${spacing.xl}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        calculatedWidth: null,
        calculatedHeight: null,
        _meta: { htmlID: '', htmlClassNames: 'hero-cta', extraStyle: ctaShadow },
      },
    });
  }

  if (!content.ctaText && !content.subheadline) {
    const headlineValues = contents[badge ? 1 : 0].values as Record<string, unknown>;
    headlineValues.containerPadding = `${spacing.xl}px ${spacing.lg}px ${spacing.xl}px`;
  }

  // ── Hero row with gradient overlay background ──
  const bgImageConfig = hasImage
    ? {
        url: content.imageUrl!,
        fullWidth: true,
        repeat: 'no-repeat' as const,
        size: 'cover' as const,
        position: 'center center',
      }
    : undefined;

  // Use gradient scrim over image for text readability
  const rowBgColor = hasImage
    ? 'transparent'
    : theme.colors.primary;

  return [
    createSingleColumnRow(contents, theme, {
      backgroundColor: rowBgColor,
      backgroundImage: bgImageConfig,
      padding: '0px',
      className: 'hero-section',
      // Pass overlay gradient as custom CSS via the row
      customCss: hasImage ? `background:${overlayGradient};` : undefined,
    }),
  ];
}

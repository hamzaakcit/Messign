import type {
  UnlayerRow as Va2UnlayerRow,
  UnlayerContent as Va2UnlayerContent,
} from '../types/unlayerTypes';
import type { HeroContent } from '../types/manifestTypes';
import type { DesignTheme } from '../types/designTokenTypes';
import { generateId, adjustBrightness } from '../designTokens';
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
 * Edge cases handled:
 * - No imageUrl: solid theme.colors.primary background
 * - Long headline (>80 chars): fontSize reduced by 20%
 * - No CTA: extra bottom padding
 * - No subheadline: extra spacing between headline and CTA
 */
export function buildHeroSection(
  content: HeroContent,
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const spacing = theme.spacing;
  const typo = theme.typography;
  const align = content.alignment ?? 'center';

  const heroFontSize =
    content.headline.length > 80 ? Math.round(typo.hero.fontSize * 0.8) : typo.hero.fontSize;

  const contents: Va2UnlayerContent[] = [];

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
      letterSpacing: typo.hero.letterSpacing !== undefined ? `${typo.hero.letterSpacing}px` : undefined,
      textTransform: typo.hero.textTransform ?? 'none',
      color: '#FFFFFF',
      containerPadding: `${spacing.xl}px ${spacing.lg}px ${content.subheadline ? spacing.xs : spacing.md}px`,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'hero-headline' },
    },
  });

  if (content.subheadline) {
    contents.push({
      id: generateId('content'),
      type: 'text',
      values: {
        text: `<p style="font-size:${typo.subheading.fontSize}px;color:rgba(255,255,255,0.9);text-align:${align};line-height:${Math.round(typo.subheading.lineHeight * 100)}%;font-family:${typo.subheading.fontFamily}">${content.subheadline}</p>`,
        containerPadding: `${spacing.xs}px ${spacing.lg}px ${content.ctaText ? spacing.md : spacing.lg}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'hero-subheadline' },
      },
    });
  }

  if (content.ctaText) {
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
        padding: `${spacing.sm}px ${spacing.lg}px`,
        borderRadius: `${theme.borderRadius}px`,
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
        _meta: { htmlID: '', htmlClassNames: 'hero-cta' },
      },
    });
  }

  if (!content.ctaText && !content.subheadline) {
    const headlineValues = contents[0].values as Record<string, unknown>;
    headlineValues.containerPadding = `${spacing.xl}px ${spacing.lg}px ${spacing.xl}px`;
  }

  const hasImage = Boolean(content.imageUrl);

  return [
    createSingleColumnRow(contents, theme, {
      backgroundColor: theme.colors.primary,
      backgroundImage: hasImage
        ? {
            url: content.imageUrl!,
            fullWidth: true,
            repeat: 'no-repeat',
            size: 'cover',
            position: 'center center',
          }
        : undefined,
      padding: '0px',
      className: 'hero-section',
    }),
  ];
}

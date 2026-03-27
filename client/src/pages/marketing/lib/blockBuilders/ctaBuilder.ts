import type {
  UnlayerRow as Va2UnlayerRow,
  UnlayerContent as Va2UnlayerContent,
} from '../types/unlayerTypes';
import type { CTAContent } from '../types/manifestTypes';
import type { DesignTheme } from '../types/designTokenTypes';
import { generateId, adjustBrightness, getPremiumEffects } from '../designTokens';
import { createSingleColumnRow } from './va2Shared';
import type { BlockBuilderOptions } from './types';

/**
 * Build a CTA (call-to-action) section — v2 Pro.
 *
 * Variants:
 * - "pill": rounded button (borderRadius: 50px), ctaPrimary bg, auto-width
 * - "ghost": outlined button (border, transparent bg, ctaPrimary text), auto-width
 * - "fullWidth": 100% width button, ctaPrimary bg, theme borderRadius
 * - "gradient": gradient background button with glow shadow (v2 new)
 *
 * v2 additions: micro-copy below button, urgency text, gradient variant, glow effect
 */
export function buildCTASection(
  content: CTAContent,
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const spacing = theme.spacing;
  const typo = theme.typography;
  const effects = getPremiumEffects(theme);
  const variant = content.variant ?? 'pill';
  const contents: Va2UnlayerContent[] = [];

  // ── Optional headline above CTA ──
  if (content.headline) {
    contents.push({
      id: generateId('content'),
      type: 'heading',
      values: {
        text: content.headline,
        headingType: 'h2',
        fontFamily: {
          label: typo.heading.fontFamily.split(',')[0].trim(),
          value: typo.heading.fontFamily,
        },
        fontSize: `${typo.heading.fontSize}px`,
        fontWeight: typo.heading.fontWeight,
        textAlign: 'center',
        lineHeight: `${Math.round(typo.heading.lineHeight * 100)}%`,
        color: theme.colors.primary,
        containerPadding: `${spacing.lg}px ${spacing.lg}px ${spacing.xs}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'cta-headline' },
      },
    });
  }

  // ── Optional description ──
  if (content.description) {
    contents.push({
      id: generateId('content'),
      type: 'text',
      values: {
        text: `<p style="color:${theme.colors.textMuted};font-size:${typo.body.fontSize}px;text-align:center;line-height:${Math.round(typo.body.lineHeight * 100)}%;font-family:${typo.body.fontFamily}">${content.description}</p>`,
        containerPadding: `${spacing.xs}px ${spacing.lg}px ${spacing.md}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'cta-desc' },
      },
    });
  }

  // ── Build CTA button based on variant ──
  const buttonContent = buildButtonByVariant(content, theme, variant, effects);
  contents.push(buttonContent);

  // ── Optional micro-copy below button (e.g., "No credit card required") ──
  const microCopy = content.microCopy || (content as Record<string, unknown>).microCopy as string | undefined;
  if (microCopy) {
    contents.push({
      id: generateId('content'),
      type: 'text',
      values: {
        text: `<p style="color:${theme.colors.textMuted};font-size:${typo.caption.fontSize}px;text-align:center;line-height:${Math.round(typo.caption.lineHeight * 100)}%;font-family:${typo.caption.fontFamily};opacity:0.8">${microCopy}</p>`,
        containerPadding: `${spacing.xs}px ${spacing.lg}px 0px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'cta-micro-copy' },
      },
    });
  }

  // ── Optional urgency text ──
  if (content.urgencyText) {
    contents.push({
      id: generateId('content'),
      type: 'text',
      values: {
        text: `<p style="color:${theme.colors.accent};font-size:${typo.caption.fontSize}px;text-align:center;line-height:${Math.round(typo.caption.lineHeight * 100)}%;font-family:${typo.caption.fontFamily};font-weight:600">${content.urgencyText}</p>`,
        containerPadding: `${spacing.xs}px ${spacing.lg}px ${spacing.lg}px`,
        anchor: '',
        hideDesktop: false,
        hideMobile: false,
        _meta: { htmlID: '', htmlClassNames: 'cta-urgency' },
      },
    });
  }

  return [
    createSingleColumnRow(contents, theme, {
      backgroundColor: theme.colors.background,
      padding: `${spacing.xl}px 0px`,
      className: 'cta-section',
    }),
  ];
}

function buildButtonByVariant(
  content: CTAContent,
  theme: DesignTheme,
  variant: string,
  effects: ReturnType<typeof getPremiumEffects>,
): Va2UnlayerContent {
  const spacing = theme.spacing;
  const typo = theme.typography;

  const baseFontValues = {
    fontFamily: {
      label: typo.cta.fontFamily.split(',')[0].trim(),
      value: typo.cta.fontFamily,
    },
    fontSize: `${typo.cta.fontSize}px`,
    fontWeight: typo.cta.fontWeight,
    textAlign: 'center' as const,
    lineHeight: `${Math.round(typo.cta.lineHeight * 100)}%`,
    letterSpacing: typo.cta.letterSpacing ? `${typo.cta.letterSpacing}px` : undefined,
    textTransform: typo.cta.textTransform || 'none',
    anchor: '',
    hideDesktop: false,
    hideMobile: false,
    calculatedWidth: null,
    calculatedHeight: null,
  };

  const href = {
    name: 'web',
    values: { href: content.buttonUrl || '#', target: '_blank' },
  };

  // Glow shadow for supported themes
  const glowShadow = effects.ctaGlow
    ? `box-shadow:0 4px 20px ${theme.colors.accentGlow ?? 'rgba(0,0,0,0.12)'};`
    : '';

  if (variant === 'gradient') {
    // Gradient button with glow — uses HTML custom content for gradient support
    const gradStart = theme.colors.gradientStart ?? theme.colors.ctaPrimary;
    const gradEnd = theme.colors.gradientEnd ?? adjustBrightness(theme.colors.ctaPrimary, 20);
    return {
      id: generateId('content'),
      type: 'html',
      values: {
        html: `<div style="text-align:center;padding:${spacing.sm}px ${spacing.lg}px ${spacing.xs}px"><a href="${content.buttonUrl || '#'}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,${gradStart},${gradEnd});color:${theme.colors.ctaText};font-family:${typo.cta.fontFamily};font-size:${typo.cta.fontSize}px;font-weight:${typo.cta.fontWeight};text-decoration:none;padding:${spacing.sm + 2}px ${spacing.lg + 8}px;border-radius:${Math.max(theme.borderRadius, 8)}px;${glowShadow}letter-spacing:${typo.cta.letterSpacing ?? 0}px;text-transform:${typo.cta.textTransform ?? 'none'}">${content.buttonText}</a></div>`,
        hideDesktop: false,
        hideMobile: false,
        containerPadding: '0px',
        anchor: '',
        _meta: { htmlID: '', htmlClassNames: 'cta-button cta-gradient' },
      },
    };
  }

  if (variant === 'pill') {
    return {
      id: generateId('content'),
      type: 'button',
      values: {
        text: content.buttonText,
        href,
        ...baseFontValues,
        _meta: { htmlID: '', htmlClassNames: 'cta-button cta-pill', extraStyle: glowShadow },
        buttonColors: {
          color: theme.colors.ctaText,
          backgroundColor: theme.colors.ctaPrimary,
          hoverColor: theme.colors.ctaText,
          hoverBackgroundColor: adjustBrightness(theme.colors.ctaPrimary, -15),
        },
        size: { autoWidth: true, width: '100%' },
        padding: `${spacing.sm + 2}px ${spacing.lg + 8}px`,
        borderRadius: '50px',
        border: {},
        containerPadding: `${spacing.sm}px ${spacing.lg}px ${spacing.xs}px`,
      },
    };
  }

  if (variant === 'ghost') {
    return {
      id: generateId('content'),
      type: 'button',
      values: {
        text: content.buttonText,
        href,
        ...baseFontValues,
        _meta: { htmlID: '', htmlClassNames: 'cta-button cta-ghost' },
        buttonColors: {
          color: theme.colors.ctaPrimary,
          backgroundColor: 'transparent',
          hoverColor: theme.colors.ctaText,
          hoverBackgroundColor: theme.colors.ctaPrimary,
        },
        size: { autoWidth: true, width: '100%' },
        padding: `${Math.round(spacing.sm * 0.75)}px ${spacing.lg - 8}px`,
        borderRadius: `${theme.borderRadius}px`,
        border: {
          borderTopWidth: '2px',
          borderTopStyle: 'solid',
          borderTopColor: theme.colors.ctaPrimary,
          borderBottomWidth: '2px',
          borderBottomStyle: 'solid',
          borderBottomColor: theme.colors.ctaPrimary,
          borderLeftWidth: '2px',
          borderLeftStyle: 'solid',
          borderLeftColor: theme.colors.ctaPrimary,
          borderRightWidth: '2px',
          borderRightStyle: 'solid',
          borderRightColor: theme.colors.ctaPrimary,
        },
        containerPadding: `${spacing.sm}px ${spacing.lg}px ${spacing.xs}px`,
      },
    };
  }

  // fullWidth (default)
  return {
    id: generateId('content'),
    type: 'button',
    values: {
      text: content.buttonText,
      href,
      ...baseFontValues,
      _meta: { htmlID: '', htmlClassNames: 'cta-button cta-fullWidth', extraStyle: glowShadow },
      buttonColors: {
        color: theme.colors.ctaText,
        backgroundColor: theme.colors.ctaPrimary,
        hoverColor: theme.colors.ctaText,
        hoverBackgroundColor: adjustBrightness(theme.colors.ctaPrimary, -15),
      },
      size: { autoWidth: false, width: '100%' },
      padding: `${spacing.sm}px 0px`,
      borderRadius: `${theme.borderRadius}px`,
      border: {},
      containerPadding: `${spacing.sm}px ${spacing.md}px ${spacing.xs}px`,
    },
  };
}

/**
 * Build a visual divider — a themed horizontal line between sections.
 * v2: supports gradient dividers for luxury/tech themes.
 */
export function buildDividerBlock(
  _content: { text?: string; style?: string },
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const spacing = theme.spacing;
  const effects = getPremiumEffects(theme);
  const style = (_content as Record<string, unknown>)?.style as string | undefined;

  // Gradient divider for premium themes
  if (effects.gradientDividers || style === 'gradient') {
    const gradStart = theme.colors.gradientStart ?? theme.colors.accent;
    const gradEnd = theme.colors.gradientEnd ?? theme.colors.ctaPrimary;
    const htmlContent: Va2UnlayerContent = {
      id: generateId('content'),
      type: 'html',
      values: {
        html: `<div style="text-align:center;padding:${spacing.md}px ${spacing.lg}px"><div style="height:2px;background:linear-gradient(90deg,transparent,${gradStart},${gradEnd},transparent);max-width:80%;margin:0 auto"></div></div>`,
        hideDesktop: false,
        hideMobile: false,
        containerPadding: '0px',
        anchor: '',
        _meta: { htmlID: '', htmlClassNames: 'divider-gradient' },
      },
    };
    return [
      createSingleColumnRow([htmlContent], theme, {
        backgroundColor: theme.colors.background,
        padding: '0px',
        className: 'divider-row',
      }),
    ];
  }

  const dividerContent: Va2UnlayerContent = {
    id: generateId('content'),
    type: 'divider',
    values: {
      width: '80%',
      border: {
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        borderTopColor: theme.colors.divider,
      },
      textAlign: 'center',
      containerPadding: `${spacing.md}px ${spacing.lg}px`,
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      _meta: { htmlID: '', htmlClassNames: 'divider' },
    },
  };

  return [
    createSingleColumnRow([dividerContent], theme, {
      backgroundColor: theme.colors.background,
      padding: '0px',
      className: 'divider-row',
    }),
  ];
}

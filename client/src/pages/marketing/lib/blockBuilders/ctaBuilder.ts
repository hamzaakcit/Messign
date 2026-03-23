import type {
  UnlayerRow as Va2UnlayerRow,
  UnlayerContent as Va2UnlayerContent,
} from '../types/unlayerTypes';
import type { CTAContent } from '../types/manifestTypes';
import type { DesignTheme } from '../types/designTokenTypes';
import { generateId, adjustBrightness } from '../designTokens';
import { createSingleColumnRow } from './va2Shared';
import type { BlockBuilderOptions } from './types';

/**
 * Build a CTA (call-to-action) section with 3 button variants.
 *
 * Variants:
 * - "pill": rounded button (borderRadius: 50px), ctaPrimary bg, auto-width
 * - "ghost": outlined button (border, transparent bg, ctaPrimary text), auto-width
 * - "fullWidth": 100% width button, ctaPrimary bg, theme borderRadius
 */
export function buildCTASection(
  content: CTAContent,
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const spacing = theme.spacing;
  const typo = theme.typography;
  const variant = content.variant ?? 'pill';
  const contents: Va2UnlayerContent[] = [];

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

  const buttonBase: Va2UnlayerContent = {
    id: generateId('content'),
    type: 'button',
    values: {},
  };

  if (variant === 'pill') {
    buttonBase.values = {
      text: content.buttonText,
      href: {
        name: 'web',
        values: { href: content.buttonUrl || '#', target: '_blank' },
      },
      fontFamily: {
        label: typo.cta.fontFamily.split(',')[0].trim(),
        value: typo.cta.fontFamily,
      },
      fontSize: `${typo.cta.fontSize}px`,
      fontWeight: typo.cta.fontWeight,
      textAlign: 'center',
      lineHeight: `${Math.round(typo.cta.lineHeight * 100)}%`,
      letterSpacing: typo.cta.letterSpacing ? `${typo.cta.letterSpacing}px` : undefined,
      textTransform: typo.cta.textTransform || 'none',
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      calculatedWidth: null,
      calculatedHeight: null,
      _meta: { htmlID: '', htmlClassNames: `cta-button cta-${variant}` },
      buttonColors: {
        color: theme.colors.ctaText,
        backgroundColor: theme.colors.ctaPrimary,
        hoverColor: theme.colors.ctaText,
        hoverBackgroundColor: adjustBrightness(theme.colors.ctaPrimary, -15),
      },
      size: { autoWidth: true, width: '100%' },
      padding: `${spacing.sm}px ${spacing.lg}px`,
      borderRadius: '50px',
      border: {},
      containerPadding: `${spacing.sm}px ${spacing.lg}px ${spacing.xs}px`,
    };
  } else if (variant === 'ghost') {
    buttonBase.values = {
      text: content.buttonText,
      href: {
        name: 'web',
        values: { href: content.buttonUrl || '#', target: '_blank' },
      },
      fontFamily: {
        label: typo.cta.fontFamily.split(',')[0].trim(),
        value: typo.cta.fontFamily,
      },
      fontSize: `${typo.cta.fontSize}px`,
      fontWeight: typo.cta.fontWeight,
      textAlign: 'center',
      lineHeight: `${Math.round(typo.cta.lineHeight * 100)}%`,
      letterSpacing: typo.cta.letterSpacing ? `${typo.cta.letterSpacing}px` : undefined,
      textTransform: typo.cta.textTransform || 'none',
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      calculatedWidth: null,
      calculatedHeight: null,
      _meta: { htmlID: '', htmlClassNames: `cta-button cta-${variant}` },
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
    };
  } else {
    buttonBase.values = {
      text: content.buttonText,
      href: {
        name: 'web',
        values: { href: content.buttonUrl || '#', target: '_blank' },
      },
      fontFamily: {
        label: typo.cta.fontFamily.split(',')[0].trim(),
        value: typo.cta.fontFamily,
      },
      fontSize: `${typo.cta.fontSize}px`,
      fontWeight: typo.cta.fontWeight,
      textAlign: 'center',
      lineHeight: `${Math.round(typo.cta.lineHeight * 100)}%`,
      letterSpacing: typo.cta.letterSpacing ? `${typo.cta.letterSpacing}px` : undefined,
      textTransform: typo.cta.textTransform || 'none',
      anchor: '',
      hideDesktop: false,
      hideMobile: false,
      calculatedWidth: null,
      calculatedHeight: null,
      _meta: { htmlID: '', htmlClassNames: `cta-button cta-${variant}` },
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
    };
  }

  contents.push(buttonBase);

  if (content.urgencyText) {
    contents.push({
      id: generateId('content'),
      type: 'text',
      values: {
        text: `<p style="color:${theme.colors.accent};font-size:${typo.caption.fontSize}px;text-align:center;line-height:${Math.round(typo.caption.lineHeight * 100)}%;font-family:${typo.caption.fontFamily}">${content.urgencyText}</p>`,
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

/**
 * Build a visual divider — a themed horizontal line between sections.
 */
export function buildDividerBlock(
  _content: { text?: string },
  theme: DesignTheme,
  _options?: BlockBuilderOptions,
): Va2UnlayerRow[] {
  const spacing = theme.spacing;

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

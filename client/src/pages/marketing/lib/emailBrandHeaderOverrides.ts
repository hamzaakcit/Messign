import { resolvePublicAssetUrl } from '../../../lib/resolvePublicAssetUrl';
import type { BrandThemeOverrides } from './designTokens';
import type { BrandEmailColors } from './emailAiDraftToDesign';

/**
 * First-party SVG in `public/email/` so Unlayer/email clients are not blocked by third-party placeholders.
 * Resolved to an absolute URL (Vite `base`) for iframe embeds.
 */
export const DEFAULT_EMAIL_HEADER_LOGO_PATH = '/email/email-logo-placeholder.svg';

/**
 * Absolute URL for the default header logo (uses `window` + `import.meta.env.BASE_URL`).
 */
export function getDefaultEmailHeaderLogoUrl(): string {
  return resolvePublicAssetUrl(DEFAULT_EMAIL_HEADER_LOGO_PATH);
}

/**
 * Ensures HTTPS absolute URLs for Unlayer; maps relative `/path` to the app origin.
 */
export function resolveLogoUrlForEmailAssembly(raw: string | undefined): string {
  const t = raw?.trim() ?? '';
  if (!t) return getDefaultEmailHeaderLogoUrl();
  if (/^https?:\/\//i.test(t)) return t;
  return resolvePublicAssetUrl(t.startsWith('/') ? t : `/${t}`);
}

/**
 * Builds VA2 email `brandOverrides` so `assembleDesign` always has a `logoUrl` for the top logo row.
 * Without it, the assembler skips the header row entirely (users saw hero-only layouts).
 */
export function buildEmailBrandOverridesForAssembly(
  colors: BrandEmailColors | undefined,
  logoUrl: string | undefined,
  companyName?: string,
): BrandThemeOverrides {
  const hasColors =
    Boolean(colors?.primary?.trim()) ||
    Boolean(colors?.accent?.trim()) ||
    Boolean(colors?.bodyBackground?.trim()) ||
    Boolean(colors?.textOnDark?.trim());
  const trimmedLogo = logoUrl?.trim();
  const logoAlt = companyName ? `${companyName} logo` : 'Brand logo';

  const base: BrandThemeOverrides = {
    primaryHex: colors?.primary,
    accentHex: colors?.accent ?? colors?.primary,
    bodyBackgroundHex: colors?.bodyBackground,
    textHex: colors?.textOnDark,
    logoAlt,
  };

  if (!hasColors && !trimmedLogo) {
    return {
      ...base,
      logoUrl: getDefaultEmailHeaderLogoUrl(),
      logoAlt,
    };
  }

  return {
    ...base,
    logoUrl: resolveLogoUrlForEmailAssembly(trimmedLogo || undefined),
    logoAlt,
  };
}

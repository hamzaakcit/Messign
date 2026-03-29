// ─────────────────────────────────────────────────────────────────────────────
// Accessibility Enforcer — WCAG AA-oriented checks for Unlayer designs
// Messign Visual Architect · v2.0
// ─────────────────────────────────────────────────────────────────────────────

import type { UnlayerDesign } from './types/unlayerTypes';

export interface AccessibilityOptions {
  subject?: string;
  headline?: string;
}

export interface AccessibilityResult {
  score: number;
  fixes: string[];
  warnings: string[];
}

const WCAG_AA_NORMAL = 4.5;
/** Warn when min inline font size is below this (13px is common in email; 14px is WCAG ideal). */
const BODY_FONT_WARN_BELOW_PX = 13;

/** First #hex in a CSS value (e.g. linear-gradient) for approximate contrast against layered text. */
function firstHexInCssColor(raw: string): string | null {
  const m = raw.match(/#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b/);
  return m ? m[0] : null;
}

function resolveBackgroundHex(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const t = raw.trim();
  if (parseHexColor(t)) return t;
  const extracted = firstHexInCssColor(t);
  if (extracted && parseHexColor(extracted)) return extracted;
  return fallback;
}

/** True when two #hex (or expanded) colors are the same sRGB — skip contrast (1:1 is usually extraction noise). */
function sameSrgbHex(a: string, b: string): boolean {
  const pa = parseHexColor(a);
  const pb = parseHexColor(b);
  if (!pa || !pb) return false;
  return pa[0] === pb[0] && pa[1] === pb[1] && pa[2] === pb[2];
}

/** Row uses a full-bleed background image (VA2 hero, etc.). Column bg is often empty; contrast vs page bg is misleading. */
function rowHasBackgroundImage(rowVals: Record<string, unknown> | undefined): boolean {
  const raw = rowVals?.backgroundImage;
  if (!raw || typeof raw !== 'object') return false;
  const url = (raw as { url?: unknown }).url;
  return typeof url === 'string' && url.trim() !== '';
}

function parseHexColor(input: string): [number, number, number] | null {
  const s = input.trim();
  const m = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * WCAG 2.1 contrast ratio between two sRGB hex colors.
 */
export function contrastRatio(hexFg: string, hexBg: string): number | null {
  const fg = parseHexColor(hexFg);
  const bg = parseHexColor(hexBg);
  if (!fg || !bg) return null;
  const l1 = relativeLuminance(fg[0], fg[1], fg[2]);
  const l2 = relativeLuminance(bg[0], bg[1], bg[2]);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Best-effort: first three RGB channels from `rgb()` / `rgba()` for contrast checks. */
function rgbCssToApproxHex(css: string): string | null {
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return null;
  const r = Math.min(255, parseInt(m[1], 10));
  const g = Math.min(255, parseInt(m[2], 10));
  const b = Math.min(255, parseInt(m[3], 10));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function extractColorsFromHtml(html: string): string[] {
  const out: string[] = [];
  const reHex = /color\s*:\s*(#[0-9a-fA-F]{3,6})/gi;
  let m: RegExpExecArray | null = reHex.exec(html);
  while (m) {
    out.push(m[1]);
    m = reHex.exec(html);
  }
  const reRgb = /color\s*:\s*(rgba?\([^)]+\))/gi;
  m = reRgb.exec(html);
  while (m) {
    const hex = rgbCssToApproxHex(m[1]);
    if (hex) out.push(hex);
    m = reRgb.exec(html);
  }
  return out;
}

function extractMinFontSizePx(html: string): number | null {
  const re = /font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/gi;
  let min: number | null = null;
  let m: RegExpExecArray | null = re.exec(html);
  while (m) {
    const n = parseFloat(m[1]);
    if (!Number.isNaN(n)) {
      min = min === null ? n : Math.min(min, n);
    }
    m = re.exec(html);
  }
  return min;
}

/**
 * Removes the common hidden preheader div (display:none + 1px font) so min font-size
 * reflects visible body copy, not inbox preview hacks.
 */
export function stripEmailHiddenPreheader(html: string): string {
  return html.replace(
    /<div\b[^>]*\bstyle="[^"]*display:\s*none[^"]*font-size:\s*1px[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    '',
  );
}

function extractMaxFontSizePx(html: string): number | null {
  const re = /font-size\s*:\s*(\d+(?:\.\d+)?)\s*px/gi;
  let max: number | null = null;
  let m: RegExpExecArray | null = re.exec(html);
  while (m) {
    const n = parseFloat(m[1]);
    if (!Number.isNaN(n)) {
      max = max === null ? n : Math.max(max, n);
    }
    m = re.exec(html);
  }
  return max;
}

/**
 * Enforce WCAG AA accessibility on a VA2 Unlayer design.
 * Returns a score (0-100) and lists of auto-fixes applied and warnings.
 */
export function enforceAccessibility(
  design: UnlayerDesign,
  options: AccessibilityOptions = {},
): AccessibilityResult {
  const fixes: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  if (!design?.body?.rows?.length) {
    warnings.push('Design has no rows — cannot assess accessibility');
    return { score: 0, fixes, warnings };
  }

  const bodyVals = design.body.values as unknown as Record<string, unknown> | undefined;
  const bgRaw = bodyVals?.backgroundColor;
  const pageBg = resolveBackgroundHex(bgRaw, '#ffffff');

  let imageHeavyRows = 0;
  let textFallbackRows = 0;
  /** Dedupe repeated inline styles (same hex on same column bg) so one email does not emit 10× contrast warnings. */
  const contrastPairSeen = new Set<string>();
  let bodyFontSizeWarningAdded = false;
  const buttonContrastSeen = new Set<string>();
  let motionOverlayWarningAdded = false;

  for (const row of design.body.rows) {
    const rowVals = row.values as unknown as Record<string, unknown> | undefined;
    const rowMeta = rowVals?._meta as { htmlClassNames?: string } | undefined;
    const rowClassNames = rowMeta?.htmlClassNames ?? '';
    const skipPhotoHeroContrast =
      rowHasBackgroundImage(rowVals) && /\bhero-section\b/i.test(rowClassNames);
    if (rowVals?._isOverlay === true && !motionOverlayWarningAdded) {
      motionOverlayWarningAdded = true;
      warnings.push(
        'Decorative motion overlay present — recipients with “reduce motion” see a static plane; many email clients strip or clip CSS animation',
      );
      score = Math.max(0, score - 2);
    }
    const rowBgRaw = rowVals?.backgroundColor;
    const rowBg =
      typeof rowBgRaw === 'string' ? resolveBackgroundHex(rowBgRaw, pageBg) : pageBg;

    let rowHasImage = false;
    let rowHasText = false;

    /** Phantom overlay rows inject animation/CSS HTML — not body copy; skip font/contrast checks. */
    const skipCopyA11yForRow = rowVals?._isOverlay === true;

    for (const col of row.columns) {
      if (skipCopyA11yForRow) continue;

      const colVals = col.values as unknown as Record<string, unknown> | undefined;
      const colBgRaw = colVals?.backgroundColor;
      const colBg =
        typeof colBgRaw === 'string' && String(colBgRaw).trim() !== ''
          ? resolveBackgroundHex(colBgRaw, rowBg)
          : rowBg;

      for (const content of col.contents) {
        if (content.type === 'image') {
          rowHasImage = true;
          const vals = content.values as Record<string, unknown>;
          if (!vals.alt && !vals.altText) {
            vals.alt = options.headline || options.subject || 'Image';
            fixes.push('Added missing alt text to image');
          }
        }

        if (content.type === 'text' || content.type === 'heading' || content.type === 'html') {
          rowHasText = true;
          const vals = content.values as Record<string, unknown>;
          const text = typeof vals.text === 'string' ? vals.text : '';
          const html = typeof vals.html === 'string' ? vals.html : '';
          const blob = `${text}${html}`;
          const meta = vals._meta as { htmlClassNames?: string } | undefined;
          const classNames = meta?.htmlClassNames ?? '';
          /** Fine print / legal lines are allowed below 14px; still checked for contrast. */
          const isFinePrint =
            /\bfooter-unsubscribe\b/i.test(classNames) ||
            /\bfooter-micro\b/i.test(classNames) ||
            /\blegal-disclaimer\b/i.test(classNames);

          const isPreheaderBlock =
            /\bpreheader\b/i.test(classNames) || /\bpreheader-row\b/i.test(rowClassNames);

          const isHeroOnPhoto =
            skipPhotoHeroContrast &&
            (/\bhero-headline\b/i.test(classNames) ||
              /\bhero-text-panel\b/i.test(classNames) ||
              /\bhero-subheadline\b/i.test(classNames));

          if (!isPreheaderBlock) {
            const cleaned = stripEmailHiddenPreheader(blob);
            const minPx = extractMinFontSizePx(cleaned);
            const maxPx = extractMaxFontSizePx(blob);
            /** If max ≥14px, at least some visible copy is readable; tiny min is usually hidden preheader noise. */
            const shouldWarnBodyFont =
              minPx !== null &&
              minPx < BODY_FONT_WARN_BELOW_PX &&
              !isFinePrint &&
              (maxPx === null || maxPx < BODY_FONT_WARN_BELOW_PX);

            if (!bodyFontSizeWarningAdded && shouldWarnBodyFont) {
              bodyFontSizeWarningAdded = true;
              warnings.push(
                `Body text may be below ${BODY_FONT_WARN_BELOW_PX}px (${minPx.toFixed(0)}px) — 14px+ is ideal for WCAG`,
              );
              score = Math.max(0, score - 4);
            }
          }

          /** Hidden inbox preheader uses display:none + color:#fff on body bg — not visible copy; skip contrast. */
          if (!isHeroOnPhoto && !isPreheaderBlock) {
            for (const hex of extractColorsFromHtml(blob)) {
              if (sameSrgbHex(hex, colBg)) continue;
              const cr = contrastRatio(hex, colBg);
              if (cr !== null && cr < WCAG_AA_NORMAL) {
                const pairKey = `${hex.toLowerCase()}|${colBg.toLowerCase()}`;
                if (contrastPairSeen.has(pairKey)) continue;
                contrastPairSeen.add(pairKey);
                warnings.push(
                  `Text/background contrast may be below WCAG AA (${cr.toFixed(2)}:1) for ${hex} on ${colBg}`,
                );
                score = Math.max(0, score - 6);
              }
            }
          }
        }

        if (content.type === 'button') {
          const vals = content.values as Record<string, unknown>;
          const bc = vals.buttonColors as { color?: string; backgroundColor?: string } | undefined;
          let fg =
            typeof bc?.color === 'string'
              ? bc.color
              : typeof vals.color === 'string'
                ? vals.color
                : typeof vals.textColor === 'string'
                  ? vals.textColor
                  : undefined;
          let bgBtn =
            typeof bc?.backgroundColor === 'string'
              ? bc.backgroundColor
              : typeof vals.backgroundColor === 'string'
                ? vals.backgroundColor
                : undefined;
          if (fg && bgBtn) {
            if (bgBtn.toLowerCase() === 'transparent') {
              bgBtn = colBg;
            }
            if (sameSrgbHex(fg, bgBtn)) continue;
            const cr = contrastRatio(fg, bgBtn);
            if (cr !== null && cr < WCAG_AA_NORMAL) {
              const bKey = `${String(fg).toLowerCase()}|${String(bgBtn).toLowerCase()}`;
              if (buttonContrastSeen.has(bKey)) continue;
              buttonContrastSeen.add(bKey);
              warnings.push(`Button label contrast may be below WCAG AA (${cr.toFixed(2)}:1)`);
              score = Math.max(0, score - 6);
            }
          }
        }
      }
    }

    if (rowHasImage && !rowHasText) {
      imageHeavyRows += 1;
    }
    if (rowHasImage && rowHasText) {
      textFallbackRows += 1;
    }
  }

  if (imageHeavyRows > 0 && textFallbackRows === 0 && imageHeavyRows >= 2) {
    warnings.push('Multiple image-heavy rows with no adjacent text — add captions or alt text for context');
    score = Math.max(0, score - 5);
  }

  return {
    score,
    fixes: [...new Set(fixes)],
    warnings: [...new Set(warnings)],
  };
}

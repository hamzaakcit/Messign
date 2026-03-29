/**
 * AI email conversion: LLM JSON → VA2 `DesignManifest` → `runEmailAssemblyPipeline` → Unlayer design.
 * v1 flat manifests (`colorTheme` / `layout` / `meta`) are bridged to VA2 via {@link legacyFlatManifestToVa2}.
 * Deprecated: `assembleLegacyDesign` — retained for explicit legacy callers only.
 */
import minimalDesign from '../unlayerTemplates/starters/minimal.json';
import emailConversionBase from '../unlayerTemplates/starters/emailConversionBase.json';
import {
  deriveImageKeywords,
  resolveArchitectEmailBodyBackgroundUrl,
  resolveHeroImageUrl,
} from './emailImageAssets';
import type {
  DesignManifest as LegacyFlatManifest,
  ManifestHeroSection,
  ManifestFeatureGridSection,
  ManifestImageTextSection,
} from './types/designManifest.types';
import { validateManifest as validateLegacyFlatManifest } from './types/designManifest.types';
import type { DesignManifest as Va2DesignManifest } from './types/manifestTypes';
import type { UnlayerDesign } from './types/unlayer.types';
import {
  buildSafeMinimalist,
  runEmailAssemblyPipeline,
  validateManifest as validateVa2Manifest,
  withUnlayerCounters,
  type ResolvedAssets,
  type UnlayerDesignWithCounters,
} from './designAssembler';
import { enhanceImagePrompt } from './designTokens';
import { legacyFlatManifestToVa2 } from './legacyFlatToVa2';
import {
  mergeResolvedAssetsIntoVa2Manifest,
  resolveAssetsForVa2Manifest,
} from './resolveVa2ManifestImages';
import {
  recordEmailAssemblyPathLegacyBridge,
  recordEmailAssemblyPathVa2Direct,
} from './emailAssemblyPathMetrics';

export type ParsedEmailDraft = {
  subject?: string;
  preview?: string;
  body: string;
};

/** Hex colors optionally read from `marketing_brand_profile.profile` JSON. */
export type BrandEmailColors = {
  primary?: string;
  accent?: string;
  bodyBackground?: string;
  textOnDark?: string;
};

/** Rich AI email layout: conversion = hero image + sections; messign-architect = no hero, environmental BG, Architect tokens. */
export type EmailLayoutStyle = 'conversion' | 'messign-architect';

export type BuildEmailDesignOptions = {
  /** Use saved or generated image as hero; overrides stock URL when set. */
  heroImageUrl?: string | null;
  /** Stable id for hero URL resolution. */
  contentId?: string;
  /** When false, stacked text rows only (legacy). Default true. */
  useRichLayout?: boolean;
  /** Rich layout variant. Default `conversion` (hero image row). Use `messign-architect` for no stock hero + Architect typography. */
  layoutStyle?: EmailLayoutStyle;
  /** When set, dark conversion layout uses these for CTA and body text (Unlayer HTML). */
  brandColors?: BrandEmailColors;
};

/** Environmental background URL (Architect layering; matches blueprint.mjml mj-body). */
export const ARCHITECT_EMAIL_BODY_BG_IMAGE_URL =
  'https://images.unsplash.com/photo-1639322537504-6427a16b0a28?auto=format&fit=crop&w=2400&q=80';

/** Best-effort extraction from org brand profile JSON (keys vary by tenant). */
export function extractBrandEmailColors(profile: unknown): BrandEmailColors | undefined {
  if (profile == null || typeof profile !== 'object') return undefined;
  const p = profile as Record<string, unknown>;
  const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  const pick = (obj: Record<string, unknown>, keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'string' && hex.test(v.trim())) return v.trim();
    }
    return undefined;
  };
  let primary = pick(p, ['primary_color', 'primaryColor', 'brand_primary', 'primary_hex', 'brand_color']);
  let accent = pick(p, ['accent_color', 'accentColor', 'cta_color', 'secondary_color', 'link_color']);
  let bodyBackground = pick(p, ['email_body_background', 'emailBodyBackground', 'dark_background', 'body_bg']);
  let textOnDark = pick(p, ['email_text_on_dark', 'text_on_dark', 'on_dark_text']);
  const colors = p.colors;
  if (colors && typeof colors === 'object' && !Array.isArray(colors)) {
    const c = colors as Record<string, unknown>;
    primary = primary ?? pick(c, ['primary', 'brand', 'main']);
    accent = accent ?? pick(c, ['accent', 'cta', 'secondary']);
  }
  const email = p.email;
  if (email && typeof email === 'object' && !Array.isArray(email)) {
    const e = email as Record<string, unknown>;
    primary = primary ?? pick(e, ['primary', 'cta_background']);
    accent = accent ?? pick(e, ['accent', 'button']);
    bodyBackground = bodyBackground ?? pick(e, ['background', 'body_bg']);
    textOnDark = textOnDark ?? pick(e, ['text']);
  }
  if (!primary && !accent && !bodyBackground && !textOnDark) return undefined;
  return { primary, accent, bodyBackground, textOnDark };
}

/**
 * Best-effort HTTPS logo URL from org `marketing_brand_profile.profile` JSON for VA2 header row.
 */
export function extractBrandLogoUrl(profile: unknown): string | undefined {
  if (profile == null || typeof profile !== 'object') return undefined;
  const p = profile as Record<string, unknown>;
  const pickUrl = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const t = v.trim();
    return /^https:\/\//i.test(t) ? t : undefined;
  };
  let u =
    pickUrl(p.logo_url) ??
    pickUrl(p.logoUrl) ??
    pickUrl(p.brand_logo) ??
    pickUrl(p.logo);
  const brand = p.brand;
  if (!u && brand && typeof brand === 'object' && !Array.isArray(brand)) {
    u = pickUrl((brand as Record<string, unknown>).logo);
  }
  const assets = p.assets;
  if (!u && assets && typeof assets === 'object' && !Array.isArray(assets)) {
    u = pickUrl((assets as Record<string, unknown>).logo_url) ?? pickUrl((assets as Record<string, unknown>).logoUrl);
  }
  return u;
}

/** Company line for auto-injected email footers when the org profile includes it. */
export interface BrandFooterDefaults {
  companyName: string;
  address: string;
}

/**
 * Best-effort company name and address from org brand profile JSON for VA2 footers.
 */
export function extractBrandFooterDefaults(profile: unknown): BrandFooterDefaults | undefined {
  if (profile == null || typeof profile !== 'object') return undefined;
  const p = profile as Record<string, unknown>;
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
  let companyName =
    str(p.company_name) ??
    str(p.companyName) ??
    str(p.legal_name) ??
    str(p.name) ??
    str(p.organization_name);
  let address =
    str(p.address) ??
    str(p.company_address) ??
    (typeof p.contact === 'object' && p.contact != null && !Array.isArray(p.contact)
      ? str((p.contact as Record<string, unknown>).address)
      : undefined);
  if (!companyName && typeof p.brand === 'object' && p.brand != null && !Array.isArray(p.brand)) {
    companyName = str((p.brand as Record<string, unknown>).name);
  }
  if (!companyName && !address) return undefined;
  return {
    companyName: companyName ?? 'Company Name',
    address: address ?? 'Company Address',
  };
}

type UnlayerRow = {
  id: string;
  cells: number[];
  columns: Array<{
    id: string;
    contents: Array<{
      type: string;
      values: Record<string, unknown>;
    }>;
    values: {
      _meta: { htmlID: string; htmlClassNames: string };
      border: Record<string, unknown>;
      padding: string;
      backgroundColor: string;
    };
  }>;
  values: Record<string, unknown>;
};

/** Parse common AI email drafts (SUBJECT / PREVIEW / BODY labels). */
export function parseStructuredEmailDraft(raw: string): ParsedEmailDraft {
  const text = raw?.trim() ?? '';
  if (!text) return { body: '' };

  const lines = text.split(/\r?\n/);
  let subject: string | undefined;
  let preview: string | undefined;
  const bodyLines: string[] = [];
  let inBody = false;
  let foundBodyLabel = false;

  for (const line of lines) {
    const sub = /^SUBJECT:\s*(.*)$/i.exec(line);
    if (sub) {
      subject = sub[1].trim() || undefined;
      continue;
    }
    const pre = /^PREVIEW:\s*(.*)$/i.exec(line);
    if (pre) {
      preview = pre[1].trim() || undefined;
      continue;
    }
    const bod = /^BODY:\s*(.*)$/i.exec(line);
    if (bod) {
      foundBodyLabel = true;
      inBody = true;
      bodyLines.push(bod[1]);
      continue;
    }
    if (inBody) bodyLines.push(line);
  }

  if (foundBodyLabel) {
    return { subject, preview, body: bodyLines.join('\n').trim() || text };
  }

  const rest = lines
    .filter((l) => !/^SUBJECT:/i.test(l) && !/^PREVIEW:/i.test(l))
    .join('\n')
    .trim();
  return { subject, preview, body: rest || text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Deep clone of minimal starter with a single editable placeholder block (loads in Unlayer without picker). */
export function cloneMinimalEmptyDesign(): Record<string, unknown> {
  const d = JSON.parse(JSON.stringify(minimalDesign)) as Record<string, unknown>;
  const body = d.body as { rows: Array<{ columns: Array<{ contents: Array<{ values: { text: string } }> }> }> };
  body.rows[0].columns[0].contents[0].values.text =
    '<p style="margin:0;font-size:15px;line-height:1.5;color:#334155;">Start building your email…</p>';
  return d;
}

export type BodyChunk = { kind: 'text'; text: string } | { kind: 'cta'; label: string };

/** Split body on CTA placeholders; exported for tests. */
export function splitBodyWithCtas(text: string): BodyChunk[] {
  const parts: BodyChunk[] = [];
  const re = /\[(?:Insert CTA button:\s*([^\]]+)|CTA:\s*([^\]]+))\]/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ kind: 'text', text: text.slice(last, m.index) });
    }
    const label = (m[1] || m[2] || '').trim();
    if (label) parts.push({ kind: 'cta', label });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push({ kind: 'text', text: text.slice(last) });
  }
  if (parts.length === 0) {
    parts.push({ kind: 'text', text });
  }
  return parts;
}

type LineSegment =
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] };

function isBulletLine(line: string): boolean {
  return /^\s*(?:[-*•]|\d+\.)\s+/.test(line);
}

function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*•]|\d+\.)\s+/, '').trim();
}

/** Parse non-CTA body text into paragraphs and bullet groups; exported for tests. */
export function parseLinesToSegments(text: string): LineSegment[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed.split(/\r?\n/);
  const segments: LineSegment[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (isBulletLine(line)) {
      const items: string[] = [];
      while (i < lines.length && isBulletLine(lines[i])) {
        items.push(stripBullet(lines[i]));
        i += 1;
      }
      segments.push({ type: 'bullets', items });
    } else {
      const paraLines: string[] = [];
      while (i < lines.length && lines[i].trim() && !isBulletLine(lines[i])) {
        paraLines.push(lines[i]);
        i += 1;
      }
      segments.push({ type: 'paragraph', text: paraLines.join('\n') });
    }
  }

  return segments;
}

function cloneRowFromMinimal(rowNum: number, colNum: number, textHtml: string): UnlayerRow {
  const base = JSON.parse(JSON.stringify(minimalDesign.body.rows[0])) as UnlayerRow;
  base.id = `row-${rowNum}`;
  base.columns[0].id = `col-${colNum}`;
  base.columns[0].values._meta = {
    htmlID: `u_column_${colNum}`,
    htmlClassNames: 'u_column',
  };
  const textContent = base.columns[0].contents[0];
  textContent.type = 'text';
  textContent.values = {
    ...((textContent.values as object) ?? {}),
    containerPadding: '12px',
    anchor: '',
    textAlign: 'left',
    lineHeight: '150%',
    linkStyle: { inherit: true },
    hideDesktop: false,
    displayCondition: null,
    _styleFeature: 'text',
    text: textHtml,
  };
  return base;
}

function setHeroImageUrl(row: UnlayerRow, url: string): void {
  const c = row.columns[0]?.contents?.[0];
  if (!c || c.type !== 'image') return;
  const values = c.values as Record<string, unknown>;
  const src = values.src;
  if (src && typeof src === 'object' && src !== null && 'url' in src) {
    (src as { url: string }).url = url;
  }
}

function cloneHeroRowFromConversionBase(): UnlayerRow {
  const row = JSON.parse(
    JSON.stringify((emailConversionBase as { body: { rows: UnlayerRow[] } }).body.rows[0]),
  ) as UnlayerRow;
  return row;
}

/**
 * Deep clone of emailConversionBase.json only — shape Unlayer already accepts (hero image row + dark body).
 * Do not splice in rows from minimal.json; mixed exports break loadDesign (blank canvas / missing tools).
 * Users add text, buttons, and more rows from the Unlayer sidebar.
 */
export function cloneConversionEmptyDesign(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(emailConversionBase)) as Record<string, unknown>;
}

function renumberRows(rows: UnlayerRow[]): UnlayerRow[] {
  return rows.map((r, i) => {
    const n = i + 1;
    const copy = JSON.parse(JSON.stringify(r)) as UnlayerRow;
    copy.id = `row-${n}`;
    copy.columns[0].id = `col-${n}`;
    copy.columns[0].values._meta = {
      htmlID: `u_column_${n}`,
      htmlClassNames: 'u_column',
    };
    return copy;
  });
}

function countTextContents(rows: UnlayerRow[]): number {
  let n = 0;
  for (const r of rows) {
    for (const c of r.columns[0]?.contents ?? []) {
      if (c.type === 'text') n += 1;
    }
  }
  return n;
}

function countImageContents(rows: UnlayerRow[]): number {
  let n = 0;
  for (const r of rows) {
    for (const c of r.columns[0]?.contents ?? []) {
      if (c.type === 'image') n += 1;
    }
  }
  return n;
}

type AiEmailChunkStyle = 'light' | 'dark';

function pushBodyChunks(
  parsed: ParsedEmailDraft,
  pushText: (html: string) => void,
  style: AiEmailChunkStyle = 'light',
  brandColors?: BrandEmailColors,
): void {
  const isDark = style === 'dark';
  const bodyColor = isDark ? (brandColors?.textOnDark ?? '#E4E4E7') : '#334155';
  const chunks = splitBodyWithCtas(parsed.body);
  for (const chunk of chunks) {
    if (chunk.kind === 'cta') {
      const label = escapeHtml(chunk.label);
      if (isDark) {
        const btnBg = brandColors?.accent ?? brandColors?.primary ?? '#00F0FF';
        pushText(
          `<p style="margin:20px 0 0;text-align:center;"><a href="#" style="display:inline-block;padding:14px 28px;background-color:${btnBg};color:#050505;border-radius:8px;text-decoration:none;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;">${label}</a></p>`,
        );
      } else {
        const g0 = brandColors?.primary ?? '#3b82f6';
        const g1 = brandColors?.accent ?? '#2563eb';
        pushText(
          `<p style="margin:20px 0 0;text-align:center;"><a href="#" style="display:inline-block;padding:14px 28px;background:linear-gradient(180deg,${g0} 0%,${g1} 100%);color:#ffffff;border-radius:8px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:600;">${label}</a></p>`,
        );
      }
      continue;
    }
    const segs = parseLinesToSegments(chunk.text);
    for (const seg of segs) {
      if (seg.type === 'paragraph') {
        pushText(
          `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${bodyColor};">${escapeHtml(seg.text).replace(/\n/g, '<br/>')}</p>`,
        );
      } else {
        const items = seg.items.map((it) => `<li style="margin:0 0 8px;">${escapeHtml(it)}</li>`).join('');
        pushText(
          `<ul style="margin:0 0 16px;padding-left:22px;font-size:16px;line-height:1.55;color:${bodyColor};">${items}</ul>`,
        );
      }
    }
  }
}

/** Dark body copy with 160% line-height (Architect “oasis of calm”). */
function pushBodyChunksArchitect(
  parsed: ParsedEmailDraft,
  pushText: (html: string) => void,
  brandColors?: BrandEmailColors,
): void {
  const bodyColor = brandColors?.textOnDark ?? '#E4E4E7';
  const chunks = splitBodyWithCtas(parsed.body);
  for (const chunk of chunks) {
    if (chunk.kind === 'cta') {
      const label = escapeHtml(chunk.label);
      const btnBg = brandColors?.accent ?? brandColors?.primary ?? '#00F0FF';
      pushText(
        `<p style="margin:20px 0 0;text-align:center;"><a href="#" style="display:inline-block;padding:14px 28px;background-color:${btnBg};color:#050505;border-radius:8px;text-decoration:none;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:800;">${label}</a></p>`,
      );
      continue;
    }
    const segs = parseLinesToSegments(chunk.text);
    for (const seg of segs) {
      if (seg.type === 'paragraph') {
        pushText(
          `<p style="margin:0 0 14px;font-size:16px;line-height:160%;color:${bodyColor};">${escapeHtml(seg.text).replace(/\n/g, '<br/>')}</p>`,
        );
      } else {
        const items = seg.items.map((it) => `<li style="margin:0 0 8px;">${escapeHtml(it)}</li>`).join('');
        pushText(
          `<ul style="margin:0 0 16px;padding-left:22px;font-size:16px;line-height:160%;color:${bodyColor};">${items}</ul>`,
        );
      }
    }
  }
}

/** Messign Architect: no hero image row; body environmental BG; crushed headline. */
function buildMessignArchitectEmailFromAiDraft(
  rawBody: string,
  options?: BuildEmailDesignOptions,
): Record<string, unknown> {
  const parsed = parseStructuredEmailDraft(rawBody);
  const design = JSON.parse(JSON.stringify(emailConversionBase)) as Record<string, unknown>;
  const bodyRoot = design.body as { rows: UnlayerRow[]; values: Record<string, unknown> };
  const counters = design.counters as {
    u_row: number;
    u_column: number;
    u_content_text: number;
    u_content_image?: number;
  };

  const brandColors = options?.brandColors;

  const rows: UnlayerRow[] = [];
  let rowNum = 0;
  let colNum = 0;

  const pushText = (textHtml: string) => {
    rowNum += 1;
    colNum += 1;
    rows.push(cloneRowFromMinimal(rowNum, colNum, textHtml));
  };

  pushText(
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0;padding:16px 12px 8px;background-color:transparent;border-radius:0 0 12px 12px;border:1px solid rgba(255,255,255,0.1);"><tr><td><p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6B7280;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;">Featured</p></td></tr></table>`,
  );

  const headlineColor = brandColors?.textOnDark ?? '#E4E4E7';
  const subColor = brandColors?.textOnDark ?? '#A1A1AA';

  if (parsed.subject) {
    pushText(
      `<p style="margin:0 0 6px;font-size:49px;font-weight:800;line-height:100%;letter-spacing:-0.025em;color:${headlineColor};">${escapeHtml(parsed.subject)}</p>`,
    );
  }
  if (parsed.preview) {
    pushText(
      `<p style="margin:0 0 14px;font-size:15px;color:${subColor};line-height:160%;">${escapeHtml(parsed.preview)}</p>`,
    );
    pushText(
      '<p style="margin:0 0 20px;height:0;border:0;border-top:1px solid #CCCCCC;">&nbsp;</p>',
    );
  }

  pushBodyChunksArchitect(parsed, pushText, brandColors);

  if (!parsed.body.trim() && !parsed.subject && !parsed.preview) {
    pushText('<p style="margin:0;font-size:15px;color:#9CA3AF;">(No body text)</p>');
  }

  const finalRows = renumberRows(rows);
  bodyRoot.rows = finalRows;

  const bgVals = bodyRoot.values as Record<string, unknown>;
  const bgImg = bgVals.backgroundImage as Record<string, unknown>;
  if (bgImg && typeof bgImg === 'object') {
    const explicit = (options?.heroImageUrl ?? '').trim();
    bgImg.url =
      explicit ||
      resolveArchitectEmailBodyBackgroundUrl(parsed, options?.contentId ?? 'draft') ||
      ARCHITECT_EMAIL_BODY_BG_IMAGE_URL;
  }

  counters.u_row = finalRows.length;
  counters.u_column = finalRows.length;
  counters.u_content_text = countTextContents(finalRows);
  counters.u_content_image = 0;

  return design;
}

/** Plain stacked rows (no hero) — legacy shape. */
function buildEmailDesignMinimalOnly(rawBody: string): Record<string, unknown> {
  const parsed = parseStructuredEmailDraft(rawBody);
  const design = JSON.parse(JSON.stringify(minimalDesign)) as Record<string, unknown>;
  const bodyRoot = design.body as { rows: UnlayerRow[] };
  const counters = design.counters as { u_row: number; u_column: number; u_content_text: number };

  const rows: UnlayerRow[] = [];
  let rowNum = 0;
  let colNum = 0;

  const pushRow = (textHtml: string) => {
    rowNum += 1;
    colNum += 1;
    rows.push(cloneRowFromMinimal(rowNum, colNum, textHtml));
  };

  if (parsed.subject) {
    pushRow(
      `<p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">${escapeHtml(parsed.subject)}</p>`,
    );
  }
  if (parsed.preview) {
    pushRow(`<p style="margin:0 0 8px;font-size:13px;color:#64748b;">${escapeHtml(parsed.preview)}</p>`);
  }

  pushBodyChunks(parsed, pushRow, 'light', undefined);

  if (rows.length === 0) {
    pushRow('<p style="margin:0;font-size:15px;color:#64748b;">(No body text)</p>');
  }

  bodyRoot.rows = rows;
  counters.u_row = rowNum;
  counters.u_column = colNum;
  counters.u_content_text = colNum;

  return design;
}

/**
 * Unlayer design: optional conversion hero + subject / preview / body as separate rows.
 */
export function buildEmailDesignFromAiDraft(
  rawBody: string,
  options?: BuildEmailDesignOptions,
): Record<string, unknown> {
  if (options?.useRichLayout === false) {
    return buildEmailDesignMinimalOnly(rawBody);
  }

  if (options?.layoutStyle === 'messign-architect') {
    return buildMessignArchitectEmailFromAiDraft(rawBody, options);
  }

  const parsed = parseStructuredEmailDraft(rawBody);
  const design = JSON.parse(JSON.stringify(emailConversionBase)) as Record<string, unknown>;
  const bodyRoot = design.body as { rows: UnlayerRow[]; values: Record<string, unknown> };
  const counters = design.counters as {
    u_row: number;
    u_column: number;
    u_content_text: number;
    u_content_image?: number;
  };

  const keywords = deriveImageKeywords(parsed);
  const seed = options?.contentId ?? 'draft';
  const textBlob = [parsed.subject, parsed.body.slice(0, 500)].filter(Boolean).join(' ');
  const stockUrl = resolveHeroImageUrl(keywords, seed, textBlob);
  const heroUrl = (options?.heroImageUrl ?? '').trim() || stockUrl;
  const brandColors = options?.brandColors;

  const rows: UnlayerRow[] = [];
  const heroRow = cloneHeroRowFromConversionBase();
  setHeroImageUrl(heroRow, heroUrl);
  rows.push(heroRow);

  let rowNum = 1;
  let colNum = 1;

  const pushText = (textHtml: string) => {
    rowNum += 1;
    colNum += 1;
    rows.push(cloneRowFromMinimal(rowNum, colNum, textHtml));
  };

  const featuredBg = brandColors?.bodyBackground ?? '#121214';
  pushText(
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0;padding:16px 12px 8px;background-color:${featuredBg};border-radius:0 0 12px 12px;border:1px solid rgba(255,255,255,0.08);"><tr><td><p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#6B7280;font-family:ui-monospace,Menlo,Monaco,Consolas,monospace;">Featured</p></td></tr></table>`,
  );

  const headlineColor = brandColors?.textOnDark ?? '#E4E4E7';
  const subColor = brandColors?.textOnDark ?? '#A1A1AA';

  if (parsed.subject) {
    pushText(
      `<p style="margin:0 0 6px;font-size:24px;font-weight:800;line-height:1.2;color:${headlineColor};letter-spacing:-0.02em;">${escapeHtml(parsed.subject)}</p>`,
    );
  }
  if (parsed.preview) {
    pushText(`<p style="margin:0 0 14px;font-size:15px;color:${subColor};line-height:1.45;">${escapeHtml(parsed.preview)}</p>`);
    pushText(
      '<p style="margin:0 0 20px;height:0;border:0;border-top:1px solid #1F1F23;">&nbsp;</p>',
    );
  }

  pushBodyChunks(parsed, pushText, 'dark', brandColors);

  if (!parsed.body.trim() && !parsed.subject && !parsed.preview) {
    pushText('<p style="margin:0;font-size:15px;color:#9CA3AF;">(No body text)</p>');
  }

  const finalRows = renumberRows(rows);
  bodyRoot.rows = finalRows;
  counters.u_row = finalRows.length;
  counters.u_column = finalRows.length;
  counters.u_content_text = countTextContents(finalRows);
  counters.u_content_image = countImageContents(finalRows);

  return design;
}

/** Plain text for gatekeepers / list views (from exported HTML or raw draft). */
export function plainTextFromHtml(html: string): string {
  if (!html.trim()) return '';
  if (typeof document === 'undefined') {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Visual Layout Architect — Manifest → DesignAssembler → Unlayer JSON
// ─────────────────────────────────────────────────────────────────────────────

export interface VisualArchitectConfig {
  /** Enable Visual Architect mode (false = skip manifest parsing; safe fallback only). */
  enabled: boolean;
  imageTimeoutMs?: number;
  generateImages?: boolean;
}

const DEFAULT_VISUAL_ARCHITECT_CONFIG: VisualArchitectConfig = {
  enabled: true,
  imageTimeoutMs: 15_000,
  generateImages: true,
};

export interface ImageGenerationRequest {
  prompt: string;
  width: number;
  height: number;
  style?: string;
}

export type ImageResolver = (req: ImageGenerationRequest) => Promise<string | null>;

const noopImageResolver: ImageResolver = async () => null;

function parseJsonFromLlmOutput(llmOutput: string): unknown | null {
  if (!llmOutput || typeof llmOutput !== 'string') return null;

  const trimmed = llmOutput.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    /* try extraction */
  }

  const fencePatterns = [/```json\s*\n?([\s\S]*?)\n?\s*```/i, /```\s*\n?([\s\S]*?)\n?\s*```/];

  for (const pattern of fencePatterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      try {
        return JSON.parse(match[1].trim());
      } catch {
        continue;
      }
    }
  }

  const braceStart = trimmed.indexOf('{');
  const braceEnd = trimmed.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try {
      return JSON.parse(trimmed.slice(braceStart, braceEnd + 1));
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Parse LLM output into either a VA2 manifest or a legacy flat manifest (v1).
 * Legacy shapes are detected via `colorTheme` + `layout` + `meta` before VA2 validation.
 */
function extractEmailManifestFromLlm(
  llmOutput: string,
):
  | { kind: 'va2'; manifest: Va2DesignManifest }
  | { kind: 'legacy'; manifest: LegacyFlatManifest }
  | null {
  const parsed = parseJsonFromLlmOutput(llmOutput);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const raw = parsed as Record<string, unknown>;
  const looksLegacyFlat =
    typeof raw.colorTheme === 'string' &&
    typeof raw.layout === 'string' &&
    raw.meta != null &&
    typeof raw.meta === 'object' &&
    !Array.isArray(raw.meta);

  if (looksLegacyFlat) {
    const leg = validateLegacyFlatManifest(parsed);
    if (leg) {
      recordEmailAssemblyPathLegacyBridge();
      return { kind: 'legacy', manifest: leg };
    }
  }

  const va2 = validateVa2Manifest(parsed);
  if (va2.valid && va2.normalizedManifest) {
    recordEmailAssemblyPathVa2Direct();
    const m = { ...va2.normalizedManifest };
    m.metadata = { ...m.metadata, assembly_source: 'va2_pipeline' };
    return { kind: 'va2', manifest: m };
  }

  if (!looksLegacyFlat) {
    const leg = validateLegacyFlatManifest(parsed);
    if (leg) {
      recordEmailAssemblyPathLegacyBridge();
      return { kind: 'legacy', manifest: leg };
    }
  }

  return null;
}

function applyHeroImageOverride(manifest: Va2DesignManifest, heroUrl?: string): Va2DesignManifest {
  if (!heroUrl?.trim()) return manifest;
  const m = structuredClone(manifest);
  const hero = m.sections.find((s) => s.type === 'hero');
  if (hero) {
    const c = hero.content as Record<string, unknown>;
    c.imageUrl = heroUrl.trim();
  }
  return m;
}

async function resolveAssetsForManifest(
  manifest: LegacyFlatManifest,
  resolver: ImageResolver,
  config: VisualArchitectConfig,
): Promise<ResolvedAssets> {
  const assets: ResolvedAssets = {};

  if (!config.generateImages) return assets;

  const promises: Array<{
    key: 'hero' | 'feature' | 'imageText';
    index?: number;
    promise: Promise<string | null>;
  }> = [];

  for (const section of manifest.sections) {
    switch (section.type) {
      case 'hero': {
        const heroSec = section as ManifestHeroSection;
        if (heroSec.imagePrompt) {
          promises.push({
            key: 'hero',
            promise: resolver({
              prompt: enhanceImagePrompt(heroSec.imagePrompt, manifest),
              width: 800,
              height: 450,
              style: heroSec.imageStyle,
            }),
          });
        }
        break;
      }

      case 'feature-grid': {
        const gridSec = section as ManifestFeatureGridSection;
        (gridSec.items ?? []).forEach((feature, i) => {
          if (feature.imagePrompt) {
            promises.push({
              key: 'feature',
              index: i,
              promise: resolver({
                prompt: enhanceImagePrompt(feature.imagePrompt, manifest),
                width: 80,
                height: 80,
                style: 'flat_illustration',
              }),
            });
          }
        });
        break;
      }

      case 'image-text': {
        const imgTextSec = section as ManifestImageTextSection;
        if (imgTextSec.imagePrompt) {
          const idx = manifest.sections.filter((s) => s.type === 'image-text').indexOf(section);
          promises.push({
            key: 'imageText',
            index: idx,
            promise: resolver({
              prompt: enhanceImagePrompt(imgTextSec.imagePrompt, manifest),
              width: 360,
              height: 240,
            }),
          });
        }
        break;
      }
      default:
        break;
    }
  }

  const timeout = config.imageTimeoutMs ?? 15_000;
  const results = await Promise.allSettled(
    promises.map(({ promise }) =>
      Promise.race([
        promise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeout)),
      ]),
    ),
  );

  const featureUrls: string[] = [];
  const imageTextUrls: Record<number, string> = {};

  results.forEach((result, i) => {
    const url = result.status === 'fulfilled' ? result.value : null;
    if (!url) return;

    const { key, index } = promises[i];
    switch (key) {
      case 'hero':
        assets.heroImageUrl = url;
        break;
      case 'feature':
        if (index !== undefined) featureUrls[index] = url;
        break;
      case 'imageText':
        if (index !== undefined) imageTextUrls[index] = url;
        break;
      default:
        break;
    }
  });

  if (featureUrls.length > 0) assets.featureImageUrls = featureUrls;
  if (Object.keys(imageTextUrls).length > 0) assets.imageTextUrls = imageTextUrls;

  return assets;
}

export interface EmailAiDraftToDesignOptions {
  llmOutput: string;
  heroImageUrl?: string;
  imageResolver?: ImageResolver;
  config?: Partial<VisualArchitectConfig>;
}

export interface EmailDesignResult {
  design: UnlayerDesignWithCounters;
  manifest: Va2DesignManifest | null;
  isFallback: boolean;
  subject: string;
  preheader: string;
  warnings: string[];
}

/**
 * Converts LLM output (VA2 or legacy flat JSON) into Unlayer design JSON via {@link runEmailAssemblyPipeline}.
 * Falls back to {@link buildSafeMinimalist} when parsing or assembly fails.
 */
export async function emailAiDraftToDesign(
  options: EmailAiDraftToDesignOptions,
): Promise<EmailDesignResult> {
  const config: VisualArchitectConfig = { ...DEFAULT_VISUAL_ARCHITECT_CONFIG, ...options.config };
  const warnings: string[] = [];
  const resolver = options.imageResolver ?? noopImageResolver;

  const extracted = config.enabled ? extractEmailManifestFromLlm(options.llmOutput) : null;

  if (!extracted) {
    if (config.enabled) {
      warnings.push(
        'Failed to parse Design Manifest from LLM output. Using Safe Minimalist fallback.',
      );
    }

    const fallback = buildSafeMinimalist(options.heroImageUrl);
    return {
      design: fallback,
      manifest: null,
      isFallback: true,
      subject: 'Untitled Email',
      preheader: '',
      warnings,
    };
  }

  let va2Manifest: Va2DesignManifest;

  if (extracted.kind === 'legacy') {
    let assets: ResolvedAssets = {};
    try {
      assets = await resolveAssetsForManifest(extracted.manifest, resolver, config);
    } catch (err) {
      warnings.push(
        `Image resolution failed: ${err instanceof Error ? err.message : 'unknown'}. Using placeholders.`,
      );
    }
    if (options.heroImageUrl) {
      assets.heroImageUrl = options.heroImageUrl;
    }
    va2Manifest = legacyFlatManifestToVa2(extracted.manifest, assets);
    const v = validateVa2Manifest(va2Manifest);
    if (v.valid && v.normalizedManifest) {
      va2Manifest = v.normalizedManifest;
    }
  } else {
    va2Manifest = extracted.manifest;
    let assets: ResolvedAssets = {};
    try {
      assets = await resolveAssetsForVa2Manifest(va2Manifest, resolver, config);
    } catch (err) {
      warnings.push(
        `Image resolution failed: ${err instanceof Error ? err.message : 'unknown'}. Using placeholders.`,
      );
    }
    if (options.heroImageUrl) {
      assets.heroImageUrl = options.heroImageUrl;
    }
    va2Manifest = mergeResolvedAssetsIntoVa2Manifest(va2Manifest, assets);
    const v = validateVa2Manifest(va2Manifest);
    if (v.valid && v.normalizedManifest) {
      va2Manifest = v.normalizedManifest;
    }
  }

  va2Manifest = applyHeroImageOverride(va2Manifest, options.heroImageUrl);

  try {
    const result = runEmailAssemblyPipeline(va2Manifest);
    if (!result.success || !result.design) {
      throw new Error('Assembly returned no design');
    }
    const design = withUnlayerCounters(result.design as unknown as UnlayerDesign);
    return {
      design,
      manifest: va2Manifest,
      isFallback: false,
      subject: va2Manifest.subject,
      preheader: va2Manifest.preheader,
      warnings,
    };
  } catch (err) {
    warnings.push(
      `Assembly failed: ${err instanceof Error ? err.message : 'unknown'}. Using Safe Minimalist.`,
    );
    const design = buildSafeMinimalist(options.heroImageUrl);
    return {
      design,
      manifest: va2Manifest,
      isFallback: true,
      subject: va2Manifest.subject,
      preheader: va2Manifest.preheader,
      warnings,
    };
  }
}

/** Synchronous path when images are already resolved (e.g. hero URL only). */
export function emailAiDraftToDesignSync(
  llmOutput: string,
  heroImageUrl?: string,
): UnlayerDesignWithCounters {
  const extracted = extractEmailManifestFromLlm(llmOutput);
  if (!extracted) {
    return buildSafeMinimalist(heroImageUrl);
  }

  let va2Manifest: Va2DesignManifest;
  if (extracted.kind === 'legacy') {
    const assets: ResolvedAssets = {};
    if (heroImageUrl) {
      assets.heroImageUrl = heroImageUrl;
    }
    va2Manifest = legacyFlatManifestToVa2(extracted.manifest, assets);
    const v = validateVa2Manifest(va2Manifest);
    if (v.valid && v.normalizedManifest) {
      va2Manifest = v.normalizedManifest;
    }
  } else {
    va2Manifest = extracted.manifest;
    const v = validateVa2Manifest(va2Manifest);
    if (v.valid && v.normalizedManifest) {
      va2Manifest = v.normalizedManifest;
    }
  }

  va2Manifest = applyHeroImageOverride(va2Manifest, heroImageUrl);

  try {
    const result = runEmailAssemblyPipeline(va2Manifest);
    if (!result.success || !result.design) {
      return buildSafeMinimalist(heroImageUrl);
    }
    return withUnlayerCounters(result.design as unknown as UnlayerDesign);
  } catch {
    return buildSafeMinimalist(heroImageUrl);
  }
}

export default emailAiDraftToDesign;

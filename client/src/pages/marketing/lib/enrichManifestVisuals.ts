// ─────────────────────────────────────────────────────────────────────────────
// VA2 manifest visual enrichment — ensure minimum campaign image slots
// ─────────────────────────────────────────────────────────────────────────────
//
// **Contract:** Slot counts must stay aligned with {@link countImageSlotsInManifest},
// server `resolve-email-images`, and client {@link resolveAssetsForVa2Manifest} walk order.

import type { DesignManifest, ManifestSection } from './types/manifestTypes';
import { countImageSlotsInManifest } from './emailManifestImageSlots';

/** Target number of countable image slots (hero, image_text, image, value_prop, product_grid). */
export const MIN_CAMPAIGN_IMAGE_SLOTS = 3;

/**
 * When `metadata.target_image_slots` is omitted, enrichment and assembly aim for this many slots
 * (clamped to {@link MAX_CAMPAIGN_IMAGE_SLOTS}). Previously defaulted to {@link MIN_CAMPAIGN_IMAGE_SLOTS}.
 */
export const DEFAULT_CAMPAIGN_IMAGE_SLOTS = 6;

/** Upper bound for `metadata.target_image_slots` and enrichment inserts (matches slot contract cap). */
export const MAX_CAMPAIGN_IMAGE_SLOTS = 12;

const ENRICH_SECTION_HEADLINES = [
  'Why it matters',
  'Go deeper',
  'In context',
  'The details',
  'Closer look',
  'Another angle',
  'What changed',
  'Proof point',
  'Behind the scenes',
];

/** Scene hints rotate per inserted slot — always tied to campaign digest, not generic office stock. */
const SCENE_HINTS = [
  'Supporting visual: one clear subject tied to the campaign; editorial lighting; setting and props that match the offer (avoid generic conference rooms or random laptops unless the brief is B2B SaaS).',
  'Complementary angle: same theme and audience, different perspective or distance; photoreal and on-message.',
  'Detail or texture close-up: materials, product surface, or contextual prop reinforcing the offer.',
  'Environmental or lifestyle moment: place, mood, and season aligned with the campaign.',
  'Alternate benefit or use-case moment for the same audience and offer.',
  'Wide establishing shot or editorial still life reinforcing subject and preheader.',
  'Foreground subject with soft background separation; palette aligned to the campaign, not stock gray.',
  'Single hero object or person mid-action; avoid duplicating the exact composition of other slots in this email.',
  'Architectural or spatial context: room, street, or landscape that reinforces credibility without busy clutter.',
];

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isLikelyTransactionalOrSystemEmail(manifest: DesignManifest): boolean {
  const blob = `${manifest.metadata?.tone ?? ''} ${manifest.subject} ${manifest.preheader}`.toLowerCase();
  return /\b(receipt|order\s+confirm|password\s+reset|reset\s+your\s+password|verify\s+your\s+email|verification\s+code|invoice|shipping\s+confirm|your\s+code\s+is)\b/.test(
    blob,
  );
}

/**
 * Last `image_text` layout before `insertIdx` in **document order** (`section.order`),
 * so inserted rows continue magazine-style alternation (matches {@link validateManifest} + assembly).
 */
function getLastImageTextLayoutBefore(
  sortedSections: ManifestSection[],
  insertIdx: number,
): 'image_left' | 'image_right' | 'image_top' | null {
  const before = sortedSections.slice(0, insertIdx);
  const ordered = [...before].sort((a, b) => a.order - b.order);
  let last: 'image_left' | 'image_right' | 'image_top' | null = null;
  for (const s of ordered) {
    if (s.type !== 'image_text') continue;
    const c = s.content as Record<string, unknown>;
    const raw = typeof c.layout === 'string' ? c.layout : 'image_left';
    if (raw === 'image_right' || raw === 'image_top') {
      last = raw;
    } else {
      last = 'image_left';
    }
  }
  return last;
}

function firstInsertedImageTextLayout(
  last: 'image_left' | 'image_right' | 'image_top' | null,
): 'image_left' | 'image_right' {
  if (last === 'image_left') return 'image_right';
  if (last === 'image_right') return 'image_left';
  return 'image_left';
}

function bodySnippetForImageText(manifest: DesignManifest): string {
  const tb = manifest.sections.find((s) => s.type === 'text_block');
  const body = tb?.content?.body;
  if (typeof body === 'string' && body.trim()) {
    const plain = stripHtml(body);
    if (plain.length > 40) return plain.slice(0, 320) + (plain.length > 320 ? '…' : '');
    if (plain.length > 0) return plain;
  }
  const pre = manifest.preheader?.trim();
  if (pre && pre.length > 24) return pre.slice(0, 360);
  return manifest.subject.trim().slice(0, 200) || 'Campaign details';
}

/**
 * Resolves `metadata.target_image_slots` to a clamped integer in [MIN, MAX].
 * Missing or invalid values default to {@link DEFAULT_CAMPAIGN_IMAGE_SLOTS}.
 */
export function resolveTargetImageSlots(manifest: DesignManifest): number {
  const raw = manifest.metadata?.target_image_slots;
  if (raw == null || typeof raw !== 'number' || !Number.isFinite(raw)) {
    return DEFAULT_CAMPAIGN_IMAGE_SLOTS;
  }
  return Math.min(MAX_CAMPAIGN_IMAGE_SLOTS, Math.max(MIN_CAMPAIGN_IMAGE_SLOTS, Math.floor(raw)));
}

function campaignBriefDigest(manifest: DesignManifest, baseBody: string): string {
  const aud = manifest.metadata?.audience?.trim() ?? '';
  const hero = manifest.sections.find((s) => s.type === 'hero');
  const hc = (hero?.content ?? {}) as Record<string, unknown>;
  const sub = typeof hc.subheadline === 'string' ? String(hc.subheadline).trim() : '';
  const parts = [aud, manifest.subject, manifest.preheader, sub, baseBody.slice(0, 220)].filter(
    (p) => p && String(p).trim().length > 0,
  );
  return parts.join(' — ').slice(0, 420);
}

function buildEnrichedSlotImagePrompt(
  manifest: DesignManifest,
  imageStyle: string,
  baseBody: string,
  slotIndex: number,
): string {
  const topicLine = [manifest.subject, manifest.preheader].filter(Boolean).join(' — ').slice(0, 220);
  const digest = campaignBriefDigest(manifest, baseBody);
  const audience = (manifest.metadata?.audience ?? '').trim();
  const audienceBit = audience ? `Audience: ${audience.slice(0, 140)}. ` : '';
  const hintIdx =
    (slotIndex * 7 + digest.length + topicLine.length) % SCENE_HINTS.length;
  const scene = SCENE_HINTS[hintIdx];
  const slotSalt = `Inserted slot ${slotIndex + 1}: vary focal length and subject distance from other rows in this email.`;
  return `${imageStyle}. ${audienceBit}Campaign focus: ${topicLine}. Context: ${digest} — ${scene} ${slotSalt} Photoreal, single focal subject, sharp focus, no legible text or logos in frame, cohesive palette.`;
}

/**
 * Inserts `image_text` sections (with `imagePrompt`) before the footer until
 * {@link countImageSlotsInManifest} reaches {@link resolveTargetImageSlots} (default {@link DEFAULT_CAMPAIGN_IMAGE_SLOTS} when unset),
 * unless `metadata.visual_density === 'minimal'` or the copy looks transactional/system.
 *
 * Idempotent: safe to call multiple times.
 */
export function enrichManifestForVisualDensity(manifest: DesignManifest): DesignManifest {
  if (manifest.metadata?.visual_density === 'minimal') return manifest;
  if (isLikelyTransactionalOrSystemEmail(manifest)) return manifest;

  const target = resolveTargetImageSlots(manifest);
  const n = countImageSlotsInManifest(manifest);
  if (n >= target) return manifest;

  const need = target - n;
  const imageStyle =
    (manifest.artDirection?.imageStyle && String(manifest.artDirection.imageStyle).trim()) ||
    'Editorial photorealistic photography';
  const baseBody = bodySnippetForImageText(manifest);

  const sorted = [...manifest.sections].sort((a, b) => a.order - b.order);
  const footerIdx = sorted.findIndex((s) => s.type === 'footer');
  const insertIdx = footerIdx >= 0 ? footerIdx : sorted.length;

  const firstLayout = firstInsertedImageTextLayout(getLastImageTextLayoutBefore(sorted, insertIdx));
  const inserts: ManifestSection[] = [];
  for (let i = 0; i < need; i++) {
    const layout: 'image_left' | 'image_right' =
      i % 2 === 0 ? firstLayout : firstLayout === 'image_left' ? 'image_right' : 'image_left';
    const imagePrompt = buildEnrichedSlotImagePrompt(manifest, imageStyle, baseBody, i);
    const headline = ENRICH_SECTION_HEADLINES[i % ENRICH_SECTION_HEADLINES.length];
    const bodyHtml =
      i === 0
        ? `<p>${escapeHtml(baseBody)}</p>`
        : `<p>${escapeHtml(baseBody.slice(0, Math.min(200, baseBody.length)))}</p><p>${escapeHtml(`More: ${campaignBriefDigest(manifest, baseBody).slice(0, 180)}`)}</p>`;
    inserts.push({
      type: 'image_text',
      order: 0,
      content: {
        headline,
        body: bodyHtml,
        imagePrompt,
        altText: `Supporting visual ${i + 1} for this campaign`,
        layout,
      },
    });
  }

  const merged = [...sorted.slice(0, insertIdx), ...inserts, ...sorted.slice(insertIdx)];
  const renumbered: ManifestSection[] = merged.map((s, idx) => ({ ...s, order: idx + 1 }));

  return {
    ...manifest,
    sections: renumbered,
    metadata: {
      ...(manifest.metadata ?? {}),
      channel: manifest.metadata?.channel ?? 'email',
      visual_slots_auto_enriched: true,
    },
  };
}

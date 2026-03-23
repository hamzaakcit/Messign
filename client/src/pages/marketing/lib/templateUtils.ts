// ─────────────────────────────────────────────────────────────────────────────
// Template Utilities — Manifest serialization helpers
// Messign Visual Architect · v2.0
// ─────────────────────────────────────────────────────────────────────────────

import type { DesignManifest } from './types/manifestTypes';

/**
 * Convert a manifest into a reusable template by stripping runtime-specific data.
 */
export function templatizeManifest(manifest: DesignManifest): DesignManifest {
  return {
    ...manifest,
    subject: manifest.subject || 'Untitled',
    preheader: manifest.preheader || '',
    metadata: {
      ...manifest.metadata,
      campaign_id: undefined,
      ab_variant: undefined,
    },
  };
}

/**
 * Extract unique section types from a manifest's sections array.
 */
export function extractSectionTypes(manifest: DesignManifest): string[] {
  const types = new Set<string>();
  for (const section of manifest.sections) {
    types.add(section.type);
  }
  return Array.from(types);
}

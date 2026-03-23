// ─────────────────────────────────────────────────────────────────────────────
// UTM Parameter Injector — Add tracking parameters to links
// Messign Visual Architect · v2.0
// ─────────────────────────────────────────────────────────────────────────────

import type { UnlayerDesign } from './types/unlayerTypes';

export interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

export interface UTMResult {
  modifiedCount: number;
}

/**
 * Inject UTM parameters into all links in a VA2 Unlayer design.
 */
export function injectUTMParameters(
  design: UnlayerDesign,
  params: UTMParams,
): UTMResult {
  let modifiedCount = 0;

  if (!design?.body?.rows?.length) {
    return { modifiedCount };
  }

  const queryString = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join('&');

  if (!queryString) return { modifiedCount };

  for (const row of design.body.rows) {
    for (const col of row.columns) {
      for (const content of col.contents) {
        const vals = content.values as Record<string, unknown>;

        if (content.type === 'button' && vals.href) {
          const href = vals.href as Record<string, unknown>;
          const innerVals = href.values as Record<string, string> | undefined;
          if (innerVals?.href && !innerVals.href.includes('{{')) {
            const sep = innerVals.href.includes('?') ? '&' : '?';
            innerVals.href = `${innerVals.href}${sep}${queryString}`;
            modifiedCount++;
          }
        }

        if (content.type === 'text' && typeof vals.text === 'string') {
          const text = vals.text;
          const linkRegex = /href="(https?:\/\/[^"]+)"/g;
          let match: RegExpExecArray | null;
          let modified = text;
          while ((match = linkRegex.exec(text)) !== null) {
            const url = match[1];
            if (!url.includes('{{')) {
              const sep = url.includes('?') ? '&' : '?';
              modified = modified.replace(url, `${url}${sep}${queryString}`);
              modifiedCount++;
            }
          }
          vals.text = modified;
        }
      }
    }
  }

  return { modifiedCount };
}

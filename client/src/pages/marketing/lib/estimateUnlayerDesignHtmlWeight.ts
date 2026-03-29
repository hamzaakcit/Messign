/**
 * Rough upper bound for exported marketing HTML size from Unlayer design JSON.
 * Real HTML is larger than raw JSON (CSS, table markup, image tags); this blends
 * JSON length with URL density for a practical warning signal in the builder.
 */

/** When estimated size exceeds this, the pipeline strip shows an amber hint. */
export const ESTIMATED_HTML_EXPORT_WARN_KB = 220;

export interface UnlayerDesignHtmlWeightEstimate {
  /** Heuristic byte count before gzip. */
  estimatedBytes: number;
  /** `https?` URLs found in the serialized design (often images). */
  httpUrlCount: number;
}

/**
 * Estimates exported HTML weight from the stringified Unlayer design object.
 *
 * @param designJson - Typically `JSON.stringify(body_design)` from the content row or editor export.
 */
export function estimateUnlayerDesignHtmlWeight(designJson: string): UnlayerDesignHtmlWeightEstimate {
  const len = designJson.length;
  const urlMatches = designJson.match(/https?:\/\/[^\s"'\\>]+/g) ?? [];
  const uniqueUrls = new Set(urlMatches);
  const base = len * 2.4;
  const urlLift = uniqueUrls.size * 96;
  const estimatedBytes = Math.round(base + urlLift);
  return { estimatedBytes, httpUrlCount: uniqueUrls.size };
}

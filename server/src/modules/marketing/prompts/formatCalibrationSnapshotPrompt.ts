/**
 * Formats a stored calibration snapshot into the `<performance_calibration>` block
 * consumed by `buildMarketingContentStrategistPrompt`.
 */

import type { CalibrationSnapshotRow } from '../../../dal/marketing/calibrationSnapshots.js';

interface TopSubject {
  subject: string;
  preheader: string;
  open_rate: number;
  click_rate: number;
  content_id: string;
}

interface TopCta {
  buttonText: string;
  click_rate: number;
  content_id: string;
}

interface TopHook {
  hook_type: string;
  headline: string;
  open_rate: number;
  content_id: string;
}

function parseJsonArray<T>(v: unknown): T[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v as T[];
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v) as unknown;
      return Array.isArray(p) ? (p as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parsePatternStrings(v: unknown): string[] {
  const arr = parseJsonArray<string>(v);
  return arr.filter((x): x is string => typeof x === 'string');
}

/**
 * Builds the performance calibration markdown from a snapshot row.
 */
export function formatCalibrationSnapshotPrompt(
  snapshot: CalibrationSnapshotRow,
): string {
  const topSubjects = parseJsonArray<TopSubject>(snapshot.top_subjects);
  const bottomSubjects = parseJsonArray<TopSubject>(snapshot.bottom_subjects);
  const topCtas = parseJsonArray<TopCta>(snapshot.top_ctas);
  const bottomCtas = parseJsonArray<TopCta>(snapshot.bottom_ctas);
  const topHooks = parseJsonArray<TopHook>(snapshot.top_hooks);
  const patterns = parsePatternStrings(snapshot.detected_patterns);

  const parts: string[] = [];

  parts.push(`<performance_calibration>`);
  parts.push(``);
  parts.push(`## Performance Calibration — Learn From Real Results`);
  parts.push(``);
  parts.push(
    `The following data comes from this organization's actual email sends over the last 30 days (${snapshot.emails_sent} emails sent). Use it to calibrate your copy decisions — not as rigid rules, but as evidence about what THIS audience responds to.`,
  );
  parts.push(``);

  const openPct = (snapshot.avg_open_rate ?? 0) * 100;
  const clickPct = (snapshot.avg_click_rate ?? 0) * 100;
  parts.push(`### Baseline Metrics`);
  parts.push(`- Average open rate: ${openPct.toFixed(1)}%`);
  parts.push(`- Average click rate: ${clickPct.toFixed(1)}%`);
  parts.push(`- Goal: beat these averages on every send.`);
  parts.push(``);

  if (topSubjects.length > 0) {
    parts.push(`### Top-Performing Subject Lines (highest open rates)`);
    parts.push(`Study these — they worked for this specific audience.`);
    for (const ts of topSubjects) {
      const pre = ts.preheader
        ? ` (preheader: "${ts.preheader}")`
        : '';
      parts.push(
        `- **"${ts.subject}"** — ${(ts.open_rate * 100).toFixed(1)}% open rate${pre}`,
      );
    }
    parts.push(``);
  }

  if (bottomSubjects.length > 0) {
    parts.push(`### Lowest-Performing Subject Lines (avoid these patterns)`);
    for (const bs of bottomSubjects) {
      parts.push(
        `- **"${bs.subject}"** — ${(bs.open_rate * 100).toFixed(1)}% open rate`,
      );
    }
    parts.push(``);
  }

  if (topCtas.length > 0) {
    parts.push(`### Top-Performing CTA Button Text (highest click rates)`);
    for (const tc of topCtas) {
      parts.push(
        `- **"${tc.buttonText}"** — ${(tc.click_rate * 100).toFixed(1)}% click rate`,
      );
    }
    parts.push(``);
  }

  if (bottomCtas.length > 0) {
    parts.push(`### Lowest-Performing CTA Button Text`);
    for (const bc of bottomCtas) {
      parts.push(
        `- **"${bc.buttonText}"** — ${(bc.click_rate * 100).toFixed(1)}% click rate`,
      );
    }
    parts.push(``);
  }

  if (topHooks.length > 0) {
    parts.push(`### Hook Types That Worked`);
    for (const th of topHooks) {
      const head = th.headline.slice(0, 60);
      const ell = th.headline.length > 60 ? '...' : '';
      parts.push(
        `- **${th.hook_type}**: "${head}${ell}" — ${(th.open_rate * 100).toFixed(1)}% open rate`,
      );
    }
    parts.push(``);
  }

  if (patterns.length > 0) {
    parts.push(`### Detected Patterns for This Audience`);
    parts.push(
      `These are data-driven observations, not universal rules. Weight them when they apply to the current brief.`,
    );
    for (const p of patterns) {
      parts.push(`- ${p}`);
    }
    parts.push(``);
  }

  parts.push(`### How to Use This Data`);
  parts.push(
    `- When choosing between subject line candidates, prefer patterns that match the top performers above.`,
  );
  parts.push(
    `- When the detected patterns conflict with general best practices (Phases 2–5), **favor the data** — this audience's behavior overrides generic advice.`,
  );
  parts.push(
    `- Do NOT copy top-performing subjects literally. Extract the PATTERN (length, structure, emotional trigger) and apply it to the new topic.`,
  );
  parts.push(
    `- The bottom performers are just as valuable: if short curiosity-gap subjects consistently underperform for this audience, don't default to them.`,
  );
  parts.push(``);
  parts.push(`</performance_calibration>`);

  return parts.join('\n');
}

/**
 * Calibration Snapshot Job — aggregates email performance from `performance_feedback`
 * + `marketing_content` (va2_manifest) and writes `calibration_snapshots` for Phase 7.
 *
 * Scheduled weekly via pg-boss + cron enqueue.
 */

import type { PoolClient } from 'pg';
import { withTenantQuery } from '../middleware/tenantContext.js';
import { query } from '../db/index.js';
import {
  insertCalibrationSnapshot,
  type InsertCalibrationSnapshotInput,
} from '../dal/marketing/calibrationSnapshots.js';
import { invalidateCalibrationCache } from '../services/marketing/calibrationCache.js';
import { registerJobHandler, JOB_NAMES } from '../services/jobQueue.js';
import type { Job } from 'pg-boss';

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

interface TopSection {
  type: string;
  position: number;
  engagement_score: number;
  content_id: string;
}

interface DetectedPattern {
  pattern: string;
  confidence: 'high' | 'medium' | 'low';
  sample_size: number;
}

interface MetricRow {
  content_id: string;
  subject: string | null;
  preheader: string | null;
  sections_json: unknown;
  open_rate: number | null;
  click_rate: number | null;
  bounce_rate: number | null;
  complaint_rate: number | null;
  sends: number | null;
}

function parseSections(raw: unknown): Array<Record<string, unknown>> {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p) ? (p as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function extractCtaText(sections: Array<Record<string, unknown>>): string {
  const cta = sections.find((s) => String(s.type) === 'cta');
  const content = cta?.content as Record<string, unknown> | undefined;
  if (content) {
    const b =
      (content.buttonText as string) ||
      (content.ctaText as string) ||
      (content.label as string);
    if (b) return String(b);
  }
  const hero = sections.find((s) => String(s.type) === 'hero');
  const hc = hero?.content as Record<string, unknown> | undefined;
  if (hc?.ctaText) return String(hc.ctaText);
  return '(unknown)';
}

function classifyHook(text: string): string {
  const t = text.toLowerCase().trim();
  if (
    /^(you|your)\b/.test(t) ||
    /\b(struggle|frustrated|tired of|sick of|problem)\b/.test(t)
  ) {
    return 'pain_agitation';
  }
  if (
    /^(last|yesterday|she|he|they|i|we)\b/.test(t) &&
    /\b(then|when|but|until)\b/.test(t)
  ) {
    return 'story_open';
  }
  if (
    /\b(myth|wrong|stop|actually|forget|never)\b/.test(t) ||
    /\?$/.test(t)
  ) {
    return 'contrarian';
  }
  if (/\b(secret|hidden|what if|imagine|the one thing)\b/.test(t)) {
    return 'curiosity_gap';
  }
  return 'unclassified';
}

function firstNarrativeHeadline(
  sections: Array<Record<string, unknown>>,
): string {
  const sorted = [...sections].sort(
    (a, b) => Number(a.order ?? 0) - Number(b.order ?? 0),
  );
  const first = sorted.find((s) =>
    ['hero', 'text_block', 'text', 'image_text'].includes(String(s.type)),
  );
  const c = first?.content as Record<string, unknown> | undefined;
  if (!c) return '';
  const headline = c.headline as string | undefined;
  if (headline) return headline;
  const body = c.body as string | undefined;
  return body ? body.slice(0, 80) : '';
}

function buildTopSections(byOpen: MetricRow[]): TopSection[] {
  const out: TopSection[] = [];
  for (const r of byOpen.slice(0, 3)) {
    const sections = parseSections(r.sections_json);
    const sorted = [...sections].sort(
      (a, b) => Number(a.order ?? 0) - Number(b.order ?? 0),
    );
    const first = sorted[0];
    if (first) {
      out.push({
        type: String(first.type ?? 'unknown'),
        position: 0,
        engagement_score: r.open_rate ?? 0,
        content_id: r.content_id,
      });
    }
  }
  return out;
}

function normalizeRows(raw: Record<string, unknown>[]): MetricRow[] {
  return raw.map((r) => ({
    content_id: String(r.content_id ?? ''),
    subject: r.subject != null ? String(r.subject) : null,
    preheader: r.preheader != null ? String(r.preheader) : null,
    sections_json: r.sections_json,
    open_rate:
      r.open_rate != null ? Number(r.open_rate) : null,
    click_rate:
      r.click_rate != null ? Number(r.click_rate) : null,
    bounce_rate:
      r.bounce_rate != null ? Number(r.bounce_rate) : null,
    complaint_rate:
      r.complaint_rate != null ? Number(r.complaint_rate) : null,
    sends: r.sends != null ? Number(r.sends) : null,
  }));
}

/**
 * Aggregates the last 30 days of email send metrics and inserts one calibration snapshot.
 */
export async function runCalibrationSnapshot(
  organizationId: string,
): Promise<void> {
  const windowEnd = new Date();
  const windowStart = new Date(
    windowEnd.getTime() - 30 * 24 * 60 * 60 * 1000,
  );

  const rows = await withTenantQuery(organizationId, async (client: PoolClient) => {
    const res = await client.query(
      `WITH latest_pf AS (
        SELECT DISTINCT ON (pf.content_id)
          pf.content_id,
          pf.open_rate,
          pf.click_through_rate,
          pf.bounce_rate,
          pf.unsubscribe_rate,
          pf.send_count,
          pf.recorded_at
        FROM performance_feedback pf
        WHERE pf.organization_id = $1
          AND pf.channel = 'email'
          AND pf.recorded_at >= $2
          AND pf.recorded_at <= $3
        ORDER BY pf.content_id, pf.recorded_at DESC
      )
      SELECT
        mc.id AS content_id,
        mc.body_design->'va2_manifest'->>'subject' AS subject,
        mc.body_design->'va2_manifest'->>'preheader' AS preheader,
        mc.body_design->'va2_manifest'->'sections' AS sections_json,
        lp.open_rate,
        lp.click_through_rate AS click_rate,
        lp.bounce_rate,
        lp.unsubscribe_rate AS complaint_rate,
        lp.send_count AS sends,
        lp.recorded_at
      FROM latest_pf lp
      INNER JOIN marketing_content mc
        ON mc.id = lp.content_id AND mc.organization_id = $1
      WHERE lp.send_count >= 50
      ORDER BY lp.recorded_at DESC`,
      [organizationId, windowStart.toISOString(), windowEnd.toISOString()],
    );
    return normalizeRows(res.rows as Record<string, unknown>[]);
  });

  if (rows.length < 3) {
    return;
  }

  const totalSent = rows.reduce((sum, r) => sum + (r.sends ?? 0), 0);
  const n = rows.length;
  const avgOpenRate =
    rows.reduce((sum, r) => sum + (r.open_rate ?? 0), 0) / n;
  const avgClickRate =
    rows.reduce((sum, r) => sum + (r.click_rate ?? 0), 0) / n;
  const avgBounceRate =
    rows.reduce((sum, r) => sum + (r.bounce_rate ?? 0), 0) / n;
  const avgComplaintRate =
    rows.reduce((sum, r) => sum + (r.complaint_rate ?? 0), 0) / n;

  const byOpenRate = [...rows].sort(
    (a, b) => (b.open_rate ?? 0) - (a.open_rate ?? 0),
  );
  const byClickRate = [...rows].sort(
    (a, b) => (b.click_rate ?? 0) - (a.click_rate ?? 0),
  );

  const topSubjects: TopSubject[] = byOpenRate.slice(0, 3).map((r) => ({
    subject: r.subject ?? '',
    preheader: r.preheader ?? '',
    open_rate: r.open_rate ?? 0,
    click_rate: r.click_rate ?? 0,
    content_id: r.content_id,
  }));

  const bottomSubjects: TopSubject[] = byOpenRate
    .slice(-3)
    .reverse()
    .map((r) => ({
      subject: r.subject ?? '',
      preheader: r.preheader ?? '',
      open_rate: r.open_rate ?? 0,
      click_rate: r.click_rate ?? 0,
      content_id: r.content_id,
    }));

  const topCtas: TopCta[] = byClickRate.slice(0, 3).map((r) => {
    const sections = parseSections(r.sections_json);
    return {
      buttonText: extractCtaText(sections),
      click_rate: r.click_rate ?? 0,
      content_id: r.content_id,
    };
  });

  const bottomCtas: TopCta[] = byClickRate
    .slice(-3)
    .reverse()
    .map((r) => {
      const sections = parseSections(r.sections_json);
      return {
        buttonText: extractCtaText(sections),
        click_rate: r.click_rate ?? 0,
        content_id: r.content_id,
      };
    });

  const topHooks: TopHook[] = byOpenRate.slice(0, 5).map((r) => {
    const sections = parseSections(r.sections_json);
    const headline = firstNarrativeHeadline(sections);
    return {
      hook_type: classifyHook(headline),
      headline,
      open_rate: r.open_rate ?? 0,
      content_id: r.content_id,
    };
  });

  const topSections = buildTopSections(byOpenRate);

  const patterns: DetectedPattern[] = [];

  const shortSubjects = rows.filter((r) => (r.subject ?? '').length <= 35);
  const longSubjects = rows.filter((r) => (r.subject ?? '').length > 35);
  if (shortSubjects.length >= 3 && longSubjects.length >= 3) {
    const avgOpenShort =
      shortSubjects.reduce((s, r) => s + (r.open_rate ?? 0), 0) /
      shortSubjects.length;
    const avgOpenLong =
      longSubjects.reduce((s, r) => s + (r.open_rate ?? 0), 0) /
      longSubjects.length;
    if (avgOpenLong > 0) {
      const diff = Math.round(
        ((avgOpenShort - avgOpenLong) / avgOpenLong) * 100,
      );
      if (Math.abs(diff) > 10) {
        patterns.push({
          pattern:
            diff > 0
              ? `Short subject lines (≤35 chars) outperform longer ones by ${diff}% in open rate for this audience.`
              : `Longer subject lines (>35 chars) outperform shorter ones by ${Math.abs(diff)}% in open rate for this audience.`,
          confidence: Math.abs(diff) > 25 ? 'high' : 'medium',
          sample_size: rows.length,
        });
      }
    }
  }

  const questionSubjects = rows.filter((r) => (r.subject ?? '').includes('?'));
  const nonQuestionSubjects = rows.filter(
    (r) => !(r.subject ?? '').includes('?'),
  );
  if (questionSubjects.length >= 3 && nonQuestionSubjects.length >= 3) {
    const avgOpenQ =
      questionSubjects.reduce((s, r) => s + (r.open_rate ?? 0), 0) /
      questionSubjects.length;
    const avgOpenNQ =
      nonQuestionSubjects.reduce((s, r) => s + (r.open_rate ?? 0), 0) /
      nonQuestionSubjects.length;
    if (avgOpenNQ > 0) {
      const diff = Math.round(((avgOpenQ - avgOpenNQ) / avgOpenNQ) * 100);
      if (Math.abs(diff) > 10) {
        patterns.push({
          pattern:
            diff > 0
              ? `Questions in subject lines boost open rate by ${diff}% for this audience. Consider curiosity-gap questions.`
              : `Statement subjects outperform questions by ${Math.abs(diff)}% for this audience. Lead with assertions.`,
          confidence: Math.abs(diff) > 25 ? 'high' : 'medium',
          sample_size: rows.length,
        });
      }
    }
  }

  const numberSubjects = rows.filter((r) => /\d/.test(r.subject ?? ''));
  const noNumberSubjects = rows.filter((r) => !/\d/.test(r.subject ?? ''));
  if (numberSubjects.length >= 3 && noNumberSubjects.length >= 3) {
    const avgOpenNum =
      numberSubjects.reduce((s, r) => s + (r.open_rate ?? 0), 0) /
      numberSubjects.length;
    const avgOpenNoNum =
      noNumberSubjects.reduce((s, r) => s + (r.open_rate ?? 0), 0) /
      noNumberSubjects.length;
    if (avgOpenNoNum > 0) {
      const diff = Math.round(
        ((avgOpenNum - avgOpenNoNum) / avgOpenNoNum) * 100,
      );
      if (Math.abs(diff) > 10) {
        patterns.push({
          pattern:
            diff > 0
              ? `Subjects with numbers get ${diff}% higher open rates for this audience. Lean into data-driven subjects.`
              : `Subjects without numbers get ${Math.abs(diff)}% higher open rates for this audience. This audience may prefer narrative subjects over data.`,
          confidence: Math.abs(diff) > 25 ? 'high' : 'medium',
          sample_size: rows.length,
        });
      }
    }
  }

  const youSubjects = rows.filter((r) =>
    /\byou(r)?\b/i.test(r.subject ?? ''),
  );
  const noYouSubjects = rows.filter(
    (r) => !/\byou(r)?\b/i.test(r.subject ?? ''),
  );
  if (youSubjects.length >= 3 && noYouSubjects.length >= 3) {
    const avgOpenYou =
      youSubjects.reduce((s, r) => s + (r.open_rate ?? 0), 0) /
      youSubjects.length;
    const avgOpenNoYou =
      noYouSubjects.reduce((s, r) => s + (r.open_rate ?? 0), 0) /
      noYouSubjects.length;
    if (avgOpenNoYou > 0) {
      const diff = Math.round(
        ((avgOpenYou - avgOpenNoYou) / avgOpenNoYou) * 100,
      );
      if (Math.abs(diff) > 15) {
        patterns.push({
          pattern:
            diff > 0
              ? `Second-person subjects ("you"/"your") outperform by ${diff}%. This audience responds to direct address.`
              : `Third-person/impersonal subjects outperform "you"/"your" by ${Math.abs(diff)}%. This audience may prefer authoritative framing.`,
          confidence: Math.abs(diff) > 25 ? 'high' : 'medium',
          sample_size: rows.length,
        });
      }
    }
  }

  const emojiRe =
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const emojiSubjects = rows.filter((r) => emojiRe.test(r.subject ?? ''));
  const noEmojiSubjects = rows.filter((r) => !emojiRe.test(r.subject ?? ''));
  if (emojiSubjects.length >= 3 && noEmojiSubjects.length >= 3) {
    const avgOpenEmoji =
      emojiSubjects.reduce((s, r) => s + (r.open_rate ?? 0), 0) /
      emojiSubjects.length;
    const avgOpenNoEmoji =
      noEmojiSubjects.reduce((s, r) => s + (r.open_rate ?? 0), 0) /
      noEmojiSubjects.length;
    if (avgOpenNoEmoji > 0) {
      const diff = Math.round(
        ((avgOpenEmoji - avgOpenNoEmoji) / avgOpenNoEmoji) * 100,
      );
      if (Math.abs(diff) > 10) {
        patterns.push({
          pattern:
            diff > 0
              ? `Emoji in subjects boosts open rate by ${diff}% for this audience.`
              : `Emoji-free subjects outperform by ${Math.abs(diff)}%. This audience prefers clean text subjects.`,
          confidence: 'medium',
          sample_size: rows.length,
        });
      }
    }
  }

  const patternStrings = patterns.map((p) => p.pattern);

  const payload: InsertCalibrationSnapshotInput = {
    emails_sent: totalSent,
    avg_open_rate: Math.round(avgOpenRate * 1000) / 1000,
    avg_click_rate: Math.round(avgClickRate * 1000) / 1000,
    avg_bounce_rate: Math.round(avgBounceRate * 1000) / 1000,
    avg_complaint_rate: Math.round(avgComplaintRate * 1000) / 1000,
    top_subjects: topSubjects,
    top_ctas: topCtas,
    top_sections: topSections,
    top_hooks: topHooks,
    bottom_subjects: bottomSubjects,
    bottom_ctas: bottomCtas,
    detected_patterns: patternStrings,
    window_start: windowStart,
    window_end: windowEnd,
  };

  await insertCalibrationSnapshot(organizationId, payload);
  invalidateCalibrationCache(organizationId, 'email');
}

/**
 * Runs a snapshot for every org that has email performance rows in the last 30 days.
 * Uses an unscoped query to list orgs (service DB role).
 */
export async function runCalibrationSnapshotForAllOrgs(): Promise<void> {
  const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { rows } = await query(
    `SELECT DISTINCT organization_id::text AS id
     FROM performance_feedback
     WHERE channel = 'email'
       AND recorded_at >= $1`,
    [windowStart.toISOString()],
  );
  for (const row of rows as { id: string }[]) {
    const id = row.id;
    if (!id) continue;
    try {
      await runCalibrationSnapshot(id);
    } catch (err) {
      console.error(`[CalibrationSnapshot] Failed for org ${id}:`, err);
    }
  }
}

/**
 * Registers the pg-boss worker for `marketing/calibration-snapshot`.
 */
export async function registerCalibrationSnapshotJobHandler(): Promise<string> {
  return registerJobHandler<Record<string, unknown>>(
    JOB_NAMES.CALIBRATION_SNAPSHOT,
    async (_jobs: Job<Record<string, unknown>>[]) => {
      await runCalibrationSnapshotForAllOrgs();
    },
  );
}

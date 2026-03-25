/**
 * Marketing Command Center — aggregates KPIs, 7-day series, experiments, and AI "plays"
 * for GET /api/marketing/dashboard/command-center.
 */

import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import type { CallerContext } from '../../dal/types.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** One point per calendar day (last `days` days, oldest first). */
export interface DailyPoint {
  date: string;
  value: number;
}

export interface CommandCenterFunnel7d {
  new: number;
  contacted: number;
  nurturing: number;
  qualified: number;
  converted: number;
  disqualified: number;
}

export interface CommandCenterCacRoi {
  cac: number;
  cpl: number;
  roi: number;
  ltvDisplay: null;
  signupVelocity: number;
  landingConversionProxy: number | null;
}

export interface SocialAccountPulse {
  platform: 'linkedin' | 'twitter' | 'instagram';
  label: string;
  /** Derived: published content pieces in window for this channel */
  contentPieces: number;
  series7d: DailyPoint[];
}

export interface CommandCenterSocialPulse {
  connected: boolean;
  lastSyncIso: string | null;
  errorCode: string | null;
  vibeScore: number;
  accounts: SocialAccountPulse[];
}

export interface ExperimentRow {
  id: string;
  kind: 'campaign' | 'email';
  name: string;
  status: string;
  channel: string | null;
  openRate: number | null;
  clickRate: number | null;
  isLive: boolean;
}

export interface StrategyPlay {
  id: string;
  title: string;
  snippet: string;
  priority: 'high' | 'medium' | 'low';
  contextJson: Record<string, unknown>;
}

export interface CommandCenterPayload {
  generatedAt: string;
  days: number;
  funnel7d: CommandCenterFunnel7d;
  funnelSeries7d: DailyPoint[];
  cacRoi: CommandCenterCacRoi;
  activeCampaigns: number;
  experiments: ExperimentRow[];
  socialPulse: CommandCenterSocialPulse;
  plays: StrategyPlay[];
}

/** Exported for unit tests — builds a contiguous day series ending today. */
export function fillMissingDays(rows: Array<{ d: string; v: number }>, days: number): DailyPoint[] {
  const map = new Map(rows.map((r) => [r.d, r.v]));
  const out: DailyPoint[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(today);
    dt.setUTCDate(dt.getUTCDate() - i);
    const key = dt.toISOString().slice(0, 10);
    out.push({ date: key, value: map.get(key) ?? 0 });
  }
  return out;
}

export interface BuildCommandCenterOptions {
  days: number;
  brandId?: string | null;
}

/**
 * Loads Command Center bundle for the tenant: funnel, CAC/ROI proxies, experiments, social pulse, strategy plays.
 */
export async function buildCommandCenterPayload(
  ctx: CallerContext,
  options: BuildCommandCenterOptions,
): Promise<CommandCenterPayload> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Organization required for command center');

  const days = Math.min(Math.max(options.days || 7, 1), 90);
  const brandId: string | null = options.brandId ?? null;

  return runInTenant(tenantId, async (client) => {
    const intervalParam = days;

    const funnelQ = client.query<Record<string, unknown>>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'new')::int AS new,
         COUNT(*) FILTER (WHERE status = 'contacted')::int AS contacted,
         COUNT(*) FILTER (WHERE status = 'nurturing')::int AS nurturing,
         COUNT(*) FILTER (WHERE status = 'qualified')::int AS qualified,
         COUNT(*) FILTER (WHERE status = 'converted')::int AS converted,
         COUNT(*) FILTER (WHERE status = 'disqualified')::int AS disqualified
       FROM marketing_leads
       WHERE created_at >= NOW() - ($1::int || ' days')::interval`,
      [intervalParam],
    );

    const funnelDailyQ = client.query<{ day: string; cnt: string }>(
      `SELECT
         (created_at AT TIME ZONE 'UTC')::date::text AS day,
         COUNT(*)::int AS cnt
       FROM marketing_leads
       WHERE created_at >= NOW() - ($1::int || ' days')::interval
       GROUP BY 1
       ORDER BY 1 ASC`,
      [intervalParam],
    );

    const spendConvertedQ = client.query<Record<string, unknown>>(
      `SELECT
         COALESCE(SUM(c.actual_spend_eur), 0)::numeric AS total_spend
       FROM marketing_campaigns c
       WHERE c.created_at >= NOW() - ($1::int || ' days')::interval`,
      [intervalParam],
    );

    const activeNowQ = client.query<Record<string, unknown>>(
      `SELECT COUNT(*)::int AS n FROM marketing_campaigns WHERE status = 'active'`,
      [],
    );

    const convertedLeadsQ = client.query<Record<string, unknown>>(
      `SELECT COUNT(*)::int AS n
       FROM marketing_leads l
       WHERE l.status = 'converted'
         AND l.created_at >= NOW() - ($1::int || ' days')::interval`,
      [intervalParam],
    );

    const totalLeadsQ = client.query<Record<string, unknown>>(
      `SELECT COUNT(*)::int AS n
       FROM marketing_leads l
       WHERE l.created_at >= NOW() - ($1::int || ' days')::interval`,
      [intervalParam],
    );

    const qualifiedLeadsQ = client.query<Record<string, unknown>>(
      `SELECT COUNT(*)::int AS n
       FROM marketing_leads l
       WHERE l.status IN ('qualified', 'converted')
         AND l.created_at >= NOW() - ($1::int || ' days')::interval`,
      [intervalParam],
    );

    const emailAggQ = client.query<Record<string, unknown>>(
      `SELECT
         COALESCE(AVG(NULLIF(ec.open_rate, 0)), 0)::numeric AS open_rate,
         COALESCE(AVG(NULLIF(ec.click_rate, 0)), 0)::numeric AS click_rate
       FROM marketing_email_campaigns ec
       WHERE ec.updated_at >= NOW() - ($1::int || ' days')::interval`,
      [intervalParam],
    );

    const campaignsListQ = client.query<Record<string, unknown>>(
      `SELECT id, name, status, channel, updated_at
       FROM marketing_campaigns
       WHERE updated_at >= NOW() - ($1::int || ' days')::interval
       ORDER BY updated_at DESC
       LIMIT 15`,
      [intervalParam],
    );

    const emailsListQ = client.query<Record<string, unknown>>(
      `SELECT id, name, status, open_rate, click_rate, updated_at
       FROM marketing_email_campaigns
       WHERE updated_at >= NOW() - ($1::int || ' days')::interval
       ORDER BY updated_at DESC
       LIMIT 15`,
      [intervalParam],
    );

    const socialChannels = ['linkedin', 'twitter', 'instagram'] as const;

    const contentByChannelQ = client.query<{ channel: string; cnt: string }>(
      `SELECT LOWER(TRIM(COALESCE(mc.channel, ''))) AS channel, COUNT(*)::int AS cnt
       FROM marketing_content mc
       WHERE mc.created_at >= NOW() - ($1::int || ' days')::interval
         AND ($2::uuid IS NULL OR mc.brand_profile_id = $2::uuid)
       GROUP BY 1`,
      [intervalParam, brandId],
    );

    const dailyPublishedByChannelQ = client.query<{ day: string; channel: string; cnt: string }>(
      `SELECT
         (mc.updated_at AT TIME ZONE 'UTC')::date::text AS day,
         LOWER(TRIM(COALESCE(mc.channel, ''))) AS channel,
         COUNT(*)::int AS cnt
       FROM marketing_content mc
       WHERE mc.status = 'published'
         AND mc.updated_at >= NOW() - ($1::int || ' days')::interval
         AND LOWER(TRIM(COALESCE(mc.channel, ''))) = ANY($2::text[])
         AND ($3::uuid IS NULL OR mc.brand_profile_id = $3::uuid)
       GROUP BY 1, 2
       ORDER BY 1 ASC`,
      [intervalParam, socialChannels as unknown as string[], brandId],
    );

    const [
      funnelR,
      funnelDailyR,
      spendR,
      activeNowR,
      convR,
      totalL,
      qualifiedR,
      emailAggR,
      campaignsR,
      emailsR,
      byChR,
      dailyPubByChR,
    ] = await Promise.all([
      funnelQ,
      funnelDailyQ,
      spendConvertedQ,
      activeNowQ,
      convertedLeadsQ,
      totalLeadsQ,
      qualifiedLeadsQ,
      emailAggQ,
      campaignsListQ,
      emailsListQ,
      contentByChannelQ,
      dailyPublishedByChannelQ,
    ]);

    const fr = funnelR.rows[0] ?? {};
    const funnel7d: CommandCenterFunnel7d = {
      new: toNum(fr.new),
      contacted: toNum(fr.contacted),
      nurturing: toNum(fr.nurturing),
      qualified: toNum(fr.qualified),
      converted: toNum(fr.converted),
      disqualified: toNum(fr.disqualified),
    };

    const funnelRows = funnelDailyR.rows.map((r) => ({
      d: String(r.day),
      v: parseInt(String(r.cnt), 10) || 0,
    }));
    const funnelSeries7d = fillMissingDays(funnelRows, days);

    const sr = spendR.rows[0] ?? {};
    const totalSpend = toNum(sr.total_spend);
    const activeCampaigns = toNum((activeNowR.rows[0] ?? {}).n);
    const convertedN = toNum((convR.rows[0] ?? {}).n);
    const totalLeadsN = toNum((totalL.rows[0] ?? {}).n);
    const mqls = toNum((qualifiedR.rows[0] ?? {}).n);

    const er = emailAggR.rows[0] ?? {};
    const avgOpen = toNum(er.open_rate);
    const avgClickRate = toNum(er.click_rate);

    const cac = convertedN > 0 ? Number((totalSpend / convertedN).toFixed(2)) : 0;
    const cpl = totalLeadsN > 0 ? Number((totalSpend / totalLeadsN).toFixed(2)) : 0;
    const roi = totalSpend > 0 && convertedN > 0 ? Number(((mqls * 100) / (totalSpend + 1)).toFixed(2)) : 0;

    const signupVelocity =
      funnelSeries7d.length > 0
        ? Number(
            (
              funnelSeries7d.reduce((a, p) => a + p.value, 0) / Math.max(funnelSeries7d.length, 1)
            ).toFixed(1),
          )
        : 0;

    const landingConversionProxy =
      funnel7d.new > 0 ? Number(((funnel7d.qualified + funnel7d.converted) / funnel7d.new).toFixed(3)) : null;

    const byChannel = new Map(byChR.rows.map((r) => [String(r.channel).toLowerCase(), parseInt(String(r.cnt), 10) || 0]));

    const accounts: SocialAccountPulse[] = socialChannels.map((platform) => {
      const contentPieces = byChannel.get(platform) ?? 0;
      const rows = dailyPubByChR.rows
        .filter((r) => String(r.channel).toLowerCase() === platform)
        .map((r) => ({
          d: String(r.day),
          v: parseInt(String(r.cnt), 10) || 0,
        }));
      const series7d = fillMissingDays(rows, days);
      return {
        platform,
        label: platform === 'twitter' ? 'X / Twitter' : platform.charAt(0).toUpperCase() + platform.slice(1),
        contentPieces,
        series7d,
      };
    });

    const totalPublished7d = accounts.reduce((a, acc) => a + acc.series7d.reduce((s, p) => s + p.value, 0), 0);
    const totalSocialPieces = socialChannels.reduce((a, p) => a + (byChannel.get(p) ?? 0), 0);
    const denom = Math.max(totalSocialPieces, 1);
    const vibeScore = Math.min(100, Math.round((totalPublished7d / denom) * 15));

    const socialPulse: CommandCenterSocialPulse = {
      connected: false,
      lastSyncIso: new Date().toISOString(),
      errorCode: null,
      vibeScore,
      accounts,
    };

    const experiments: ExperimentRow[] = [];

    for (const row of campaignsR.rows) {
      const status = String(row.status ?? '');
      experiments.push({
        id: String(row.id),
        kind: 'campaign',
        name: String(row.name ?? ''),
        status,
        channel: row.channel ? String(row.channel) : null,
        openRate: null,
        clickRate: null,
        isLive: status === 'active',
      });
    }
    for (const row of emailsR.rows) {
      const status = String(row.status ?? '');
      experiments.push({
        id: String(row.id),
        kind: 'email',
        name: String(row.name ?? ''),
        status,
        channel: 'email',
        openRate: row.open_rate != null ? toNum(row.open_rate) : null,
        clickRate: row.click_rate != null ? toNum(row.click_rate) : null,
        isLive: status === 'active' || status === 'scheduled',
      });
    }

    experiments.sort((a, b) => (b.isLive ? 1 : 0) - (a.isLive ? 1 : 0));

    const plays: StrategyPlay[] = [];
    const li = byChannel.get('linkedin') ?? 0;
    const tw = byChannel.get('twitter') ?? 0;
    if (li >= tw) {
      plays.push({
        id: 'play-li-video',
        title: 'Double down on LinkedIn',
        snippet:
          'LinkedIn content volume meets or beats X this period. Prioritize professional posts and short video clips to compound reach.',
        priority: 'high',
        contextJson: { channel: 'linkedin', linkedinPieces: li, twitterPieces: tw },
      });
    } else {
      plays.push({
        id: 'play-x-threads',
        title: 'Accelerate X / Twitter cadence',
        snippet:
          'X is outpacing LinkedIn for new assets. Increase thread frequency and cross-post highlights from your product roadmap.',
        priority: 'high',
        contextJson: { channel: 'twitter', linkedinPieces: li, twitterPieces: tw },
      });
    }

    if (avgOpen > 0 && avgOpen < 0.15) {
      plays.push({
        id: 'play-email-subject',
        title: 'Lift email open rates',
        snippet: `Average open rate is ${(avgOpen * 100).toFixed(1)}%. Test subject lines and preview text on the next two campaigns.`,
        priority: 'medium',
        contextJson: { avgOpenRate: avgOpen },
      });
    }

    if (avgClickRate > 0 && avgClickRate < 0.02) {
      plays.push({
        id: 'play-email-ctr',
        title: 'Improve email CTR',
        snippet: `Click-through is ${(avgClickRate * 100).toFixed(2)}%. Add a stronger CTA block and one more in-body link on the next send.`,
        priority: 'low',
        contextJson: { avgClickRate },
      });
    }

    plays.push({
      id: 'play-seo-keyword',
      title: 'SEO content opportunity',
      snippet:
        'Publish one long-form landing or blog piece targeting a high-intent keyword your competitors under-index on (see Intelligence).',
      priority: 'medium',
      contextJson: { module: 'intelligence' },
    });

    const payload: CommandCenterPayload = {
      generatedAt: new Date().toISOString(),
      days,
      funnel7d,
      funnelSeries7d,
      cacRoi: {
        cac,
        cpl,
        roi,
        ltvDisplay: null,
        signupVelocity,
        landingConversionProxy,
      },
      activeCampaigns,
      experiments: experiments.slice(0, 24),
      socialPulse,
      plays: plays.slice(0, 5),
    };

    return payload;
  });
}

import { getClient, query } from '../index.js';

const DEFAULT_ORG_SLUG = process.env.MARKETING_SEED_ORG_SLUG || 'messign';
const SENTINEL_CAMPAIGN = 'Demo Seed — Q2 Product Launch';

export interface MarketingSeedResult {
  seeded: boolean;
  reason?: string;
  campaigns?: number;
  content?: number;
  leads?: number;
  emailCampaigns?: number;
  approvalQueue?: number;
  calendar?: number;
}

/**
 * Idempotent sample data for Marketing Hub UI (dashboard, campaigns, content, leads, email, approvals).
 * Skips if sentinel campaign already exists for the default org.
 */
export async function seedMarketingData(): Promise<MarketingSeedResult> {
  const orgResult = await query<{ id: string }>('SELECT id FROM organizations WHERE slug = $1', [DEFAULT_ORG_SLUG]);
  const orgId = orgResult.rows[0]?.id;
  if (!orgId) {
    return { seeded: false, reason: 'no_org' };
  }

  const usersResult = await query<{ id: string }>(
    'SELECT id FROM reimbursement_users WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1',
    [orgId],
  );
  const ownerId = usersResult.rows[0]?.id;
  if (!ownerId) {
    return { seeded: false, reason: 'no_users' };
  }

  const dup = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM marketing_campaigns WHERE organization_id = $1 AND name = $2`,
    [orgId, SENTINEL_CAMPAIGN],
  );
  if (parseInt(dup.rows[0]?.c ?? '0', 10) > 0) {
    return { seeded: false, reason: 'already_present' };
  }

  const client = await getClient();
  const out: MarketingSeedResult = { seeded: true };

  try {
    await client.query('BEGIN');

    const c1 = await client.query<{ id: string }>(
      `INSERT INTO marketing_campaigns (
         organization_id, name, description, channel, status, objective,
         budget, actual_spend, currency, budget_eur, actual_spend_eur,
         start_date, end_date, target_audience, goals, owner_id,
         impressions, clicks, conversions, leads_generated, cost_per_lead, roi,
         tags
       ) VALUES (
         $1, $2,
         'Multi-channel launch for the new workspace tier — demo data.',
         'social', 'active',
         'Generate 40+ qualified leads and lift brand consideration in EU SMB.',
         12000, 4850, 'EUR', 12000, 4850,
         CURRENT_DATE - 20, CURRENT_DATE + 45,
         'B2B SMB operators (10–80 FTE) in EU',
         'Leads, engagement, webinar signups',
         $3,
         52000, 2100, 186, 28, 173.21, 2.65,
         '["launch","demo-seed","q2"]'::jsonb
       ) RETURNING id`,
      [orgId, SENTINEL_CAMPAIGN, ownerId],
    );
    const campaign1Id = c1.rows[0]!.id;

    const c2 = await client.query<{ id: string }>(
      `INSERT INTO marketing_campaigns (
         organization_id, name, description, channel, status, objective,
         budget, actual_spend, currency, budget_eur, actual_spend_eur,
         start_date, end_date, owner_id,
         impressions, clicks, leads_generated, roi, tags
       ) VALUES (
         $1,
         'Demo Seed — Enterprise Webinar Series',
         'Three-part webinar on AI ops and Dora — demo data.',
         'webinar', 'scheduled',
         'Book 200 registrations; 35 live attendees per session.',
         4500, 0, 'EUR', 4500, 0,
         CURRENT_DATE + 7, CURRENT_DATE + 90,
         $2,
         0, 0, 0, 0,
         '["webinar","demo-seed"]'::jsonb
       ) RETURNING id`,
      [orgId, ownerId],
    );
    const campaign2Id = c2.rows[0]!.id;

    await client.query(
      `INSERT INTO marketing_campaigns (
         organization_id, name, description, channel, status, objective,
         budget, actual_spend, currency, budget_eur, actual_spend_eur,
         start_date, owner_id,
         impressions, clicks, leads_generated, cost_per_lead, roi, tags
       ) VALUES (
         $1,
         'Demo Seed — Paid Search (Brand)',
         'Defensive brand terms — demo data.',
         'paid_search', 'paused',
         'Maintain SOV on brand; no prospecting in this slice.',
         8000, 2100, 'EUR', 8000, 2100,
         CURRENT_DATE - 60,
         $2,
         120000, 3400, 14, 150.0, 1.1,
         '["paid","demo-seed"]'::jsonb
       )`,
      [orgId, ownerId],
    );

    const contentReview = await client.query<{ id: string }>(
      `INSERT INTO marketing_content (
         organization_id, campaign_id, title, content_type, channel, status,
         body, scheduled_date, author_id, engagement, views, leads_attributed, tags
       ) VALUES (
         $1, $2,
         'Demo Seed — LinkedIn post: Why context beats more tools',
         'social', 'linkedin', 'in_review',
         'Tool sprawl is a context problem. When every team lives in a different app, your AI cannot see the whole business — demo seed body.',
         CURRENT_DATE + 3,
         $3, 0, 0, 0,
         '["linkedin","demo-seed"]'::jsonb
       ) RETURNING id`,
      [orgId, campaign1Id, ownerId],
    );
    const contentReviewId = contentReview.rows[0]!.id;

    const contentPub = await client.query<{ id: string }>(
      `INSERT INTO marketing_content (
         organization_id, campaign_id, title, content_type, channel, status,
         body, published_at, author_id, engagement, views, click_throughs, leads_attributed, tags
       ) VALUES (
         $1, $2,
         'Demo Seed — Blog: Consolidation playbook for COOs',
         'blog', 'web', 'published',
         'A practical checklist for replacing 4–6 tools with one operating system — demo seed.',
         NOW() - INTERVAL '5 days',
         $3, 128, 2100, 94, 6,
         '["blog","demo-seed"]'::jsonb
       ) RETURNING id`,
      [orgId, campaign1Id, ownerId],
    );
    const contentPubId = contentPub.rows[0]!.id;

    await client.query(
      `INSERT INTO marketing_content (
         organization_id, campaign_id, title, content_type, channel, status,
         body, author_id, engagement, tags
       ) VALUES
         ($1, $2, 'Demo Seed — Email nurture #1', 'email', 'email', 'scheduled',
          'Subject: The one metric that predicts rollout success — demo seed.', $4, 0, '["email","demo-seed"]'::jsonb),
         ($1, $3, 'Demo Seed — Case study outline', 'case_study', 'web', 'draft',
          'Outline only — demo seed.', $4, 0, '["case-study","demo-seed"]'::jsonb)`,
      [orgId, campaign1Id, campaign2Id, ownerId],
    );

    await client.query(
      `INSERT INTO marketing_approval_queue (
         organization_id, content_id, status, truth_validation, brand_voice_check, compliance_scan
       ) VALUES (
         $1, $2, 'pending',
         '{"overall":"warn","scores":{"factual":0.92},"demo_seed":true}'::jsonb,
         '{"overall":"pass","tone":"on_brand","demo_seed":true}'::jsonb,
         '{"overall":"pass","demo_seed":true}'::jsonb
       )`,
      [orgId, contentReviewId],
    );

    await client.query(
      `INSERT INTO marketing_leads (
         organization_id, email, first_name, last_name, company_name, job_title,
         source, campaign_id, content_id, score, status,
         utm_source, utm_medium, utm_campaign, last_activity_at
       ) VALUES
         ($1, 'demo.seed.lead1@example.com', 'Alex', 'Nguyen', 'Northwind Labs', 'COO',
          'organic', $2, $3, 88, 'new', 'linkedin', 'social', 'q2-launch', NOW()),
         ($1, 'demo.seed.lead2@example.com', 'Sam', 'O''Brien', 'Rivera Trading', 'Head of Ops',
          'paid_search', $2, $3, 76, 'contacted', 'google', 'cpc', 'brand-defence', NOW()),
         ($1, 'demo.seed.lead3@example.com', 'Jordan', 'Park', 'Helix GmbH', 'IT Director',
          'webinar', $4, NULL, 82, 'new', 'webinar', 'email', 'enterprise-series', NOW()),
         ($1, 'demo.seed.lead4@example.com', 'Casey', 'Reid', 'Atlas Foods', 'Procurement',
          'content', $2, $5, 71, 'nurturing', 'blog', 'referral', 'coo-playbook', NOW()),
         ($1, 'demo.seed.lead5@example.com', 'Morgan', 'Lee', 'Cobalt SaaS', 'VP Sales',
          'event', $2, NULL, 92, 'qualified', 'field', 'event', 'q2-launch', NOW())`,
      [orgId, campaign1Id, contentPubId, campaign2Id, contentPubId],
    );

    await client.query(
      `INSERT INTO marketing_email_campaigns (
         campaign_id, name, subject, body_html, body_text, status,
         scheduled_at, recipient_count, delivered, opened, clicked, open_rate, click_rate, created_by
       ) VALUES (
         $1,
         'Demo Seed — April nurture',
         'See how teams replaced six tools with one workspace',
         '<p>Demo seed HTML — <strong>context-first AI</strong> for operators.</p>',
         'Demo seed text version.',
         'sent',
         NOW() - INTERVAL '3 days',
         4200, 4180, 980, 310, 23.4, 7.4,
         $2
       )`,
      [campaign1Id, ownerId],
    );

    await client.query(
      `INSERT INTO marketing_campaign_spend (
         campaign_id, amount, currency, amount_eur, category, description, date, vendor, created_by
       ) VALUES
         ($1, 2200, 'EUR', 2200, 'creative', 'Demo seed — creative batch 1', CURRENT_DATE - 10, 'Studio One', $2),
         ($1, 1650, 'EUR', 1650, 'placement', 'Demo seed — paid placement', CURRENT_DATE - 5, 'Platform', $2)`,
      [campaign1Id, ownerId],
    );

    await client.query(
      `INSERT INTO marketing_budget_allocations (workspace_id, campaign_id, channel, allocated_amount, spent_amount, currency)
       VALUES
         ($1, $2, 'linkedin', 4000, 2100, 'EUR'),
         ($1, $2, 'x', 1500, 800, 'EUR')
       ON CONFLICT (workspace_id, campaign_id, channel) DO NOTHING`,
      [orgId, campaign1Id],
    );

    await client.query(
      `INSERT INTO marketing_content_calendar (
         workspace_id, content_id, campaign_id, scheduled_at, channel, status
       ) VALUES ($1, $2, $3, NOW() + INTERVAL '2 days', 'linkedin', 'scheduled')
       ON CONFLICT (workspace_id, content_id) DO NOTHING`,
      [orgId, contentPubId, campaign1Id],
    );

    await client.query('COMMIT');

    try {
      await query('REFRESH MATERIALIZED VIEW mv_marketing_roi');
    } catch {
      /* optional: view may be absent on older DBs */
    }

    out.campaigns = 3;
    out.content = 4;
    out.leads = 5;
    out.emailCampaigns = 1;
    out.approvalQueue = 1;
    out.calendar = 1;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return out;
}

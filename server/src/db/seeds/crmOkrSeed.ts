import { query, getClient } from '../index.js';

const DEFAULT_ORG_SLUG = 'messign';

export async function seedCrmOkrData(): Promise<{ crm: boolean; okr: boolean }> {
  const orgResult = await query<{ id: string }>('SELECT id FROM organizations WHERE slug = $1', [DEFAULT_ORG_SLUG]);
  const orgId = orgResult.rows[0]?.id;
  if (!orgId) {
    console.log('[crmOkrSeed] No org found, skipping.');
    return { crm: false, okr: false };
  }

  const usersResult = await query<{ id: string }>(
    'SELECT id FROM reimbursement_users WHERE organization_id = $1 LIMIT 1',
    [orgId],
  );
  const ownerId = usersResult.rows[0]?.id;
  if (!ownerId) {
    console.log('[crmOkrSeed] No reimbursement_users found, skipping.');
    return { crm: false, okr: false };
  }

  const client = await getClient();
  const result = { crm: false, okr: false };

  try {
    await client.query('BEGIN');

    // ── CRM: ensure default pipeline + stages ──
    let pipelineId: string | null = null;
    const pipeRows = await client.query<{ id: string }>(
      'SELECT id FROM crm_pipelines WHERE organization_id = $1 AND is_default = true LIMIT 1',
      [orgId],
    );
    if (pipeRows.rows[0]) {
      pipelineId = pipeRows.rows[0].id;
    } else {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO crm_pipelines (organization_id, name, description, is_default)
         VALUES ($1, 'Default Sales Pipeline', 'Standard sales process', true) RETURNING id`,
        [orgId],
      );
      pipelineId = ins.rows[0]?.id ?? null;
    }

    if (pipelineId) {
      const stageCount = await client.query<{ c: string }>(
        'SELECT COUNT(*) as c FROM crm_deal_stages WHERE pipeline_id = $1',
        [pipelineId],
      );
      if (parseInt(stageCount.rows[0].c, 10) === 0) {
        await client.query(
          `INSERT INTO crm_deal_stages (pipeline_id, name, position, probability_default, color, is_won, is_lost) VALUES
           ($1, 'Lead', 0, 10, '#60A5FA', false, false),
           ($1, 'Qualified', 1, 25, '#34D399', false, false),
           ($1, 'Proposal', 2, 50, '#FBBF24', false, false),
           ($1, 'Negotiation', 3, 75, '#F97316', false, false),
           ($1, 'Closed Won', 4, 100, '#10B981', true, false),
           ($1, 'Closed Lost', 5, 0, '#EF4444', false, true)`,
          [pipelineId],
        );
      }

      // Sample data only if no deals yet
      const dealCount = await client.query<{ c: string }>(
        'SELECT COUNT(*) as c FROM crm_deals WHERE organization_id = $1',
        [orgId],
      );
      if (parseInt(dealCount.rows[0].c, 10) === 0) {
        const stages = await client.query<{ id: string; position: number }>(
          'SELECT id, position FROM crm_deal_stages WHERE pipeline_id = $1 ORDER BY position',
          [pipelineId],
        );
        const stageIds = stages.rows.map((r) => r.id);
        const leadId = stageIds[0];
        const qualifiedId = stageIds[1] ?? stageIds[0];
        const proposalId = stageIds[2] ?? stageIds[0];
        const negotiationId = stageIds[3] ?? stageIds[0];

        // Companies
        const comp1 = await client.query<{ id: string }>(
          `INSERT INTO crm_companies (organization_id, name, domain, industry, size, created_by)
           VALUES ($1, 'Acme Corp', 'acme.example.com', 'Technology', '51-200', $2) RETURNING id`,
          [orgId, ownerId],
        );
        const comp2 = await client.query<{ id: string }>(
          `INSERT INTO crm_companies (organization_id, name, domain, industry, size, created_by)
           VALUES ($1, 'Beta Industries', 'beta.io', 'Manufacturing', '201-500', $2) RETURNING id`,
          [orgId, ownerId],
        );
        const company1Id = comp1.rows[0].id;
        const company2Id = comp2.rows[0].id;

        // Contacts
        const con1 = await client.query<{ id: string }>(
          `INSERT INTO crm_contacts (organization_id, company_id, owner_id, first_name, last_name, email, job_title)
           VALUES ($1, $2, $3, 'Jane', 'Doe', 'jane@acme.example.com', 'VP Sales') RETURNING id`,
          [orgId, company1Id, ownerId],
        );
        const con2 = await client.query<{ id: string }>(
          `INSERT INTO crm_contacts (organization_id, company_id, owner_id, first_name, last_name, email, job_title)
           VALUES ($1, $2, $3, 'John', 'Smith', 'john@beta.io', 'Procurement Lead') RETURNING id`,
          [orgId, company2Id, ownerId],
        );
        const contact1Id = con1.rows[0].id;
        const contact2Id = con2.rows[0].id;

        // Deals (spread across stages)
        await client.query(
          `INSERT INTO crm_deals (organization_id, pipeline_id, stage_id, company_id, contact_id, owner_id, title, amount, currency, amount_eur, probability, expected_close_date)
           VALUES ($1,$2,$3,$4,$5,$6,'Acme Enterprise License', 85000, 'EUR', 85000, 10, '2026-05-15')`,
          [orgId, pipelineId, leadId, company1Id, contact1Id, ownerId],
        );
        await client.query(
          `INSERT INTO crm_deals (organization_id, pipeline_id, stage_id, company_id, contact_id, owner_id, title, amount, currency, amount_eur, probability, expected_close_date)
           VALUES ($1,$2,$3,$4,$5,$6,'Beta Annual Support', 22000, 'EUR', 22000, 25, '2026-04-30')`,
          [orgId, pipelineId, qualifiedId, company2Id, contact2Id, ownerId],
        );
        await client.query(
          `INSERT INTO crm_deals (organization_id, pipeline_id, stage_id, company_id, contact_id, owner_id, title, amount, currency, amount_eur, probability, expected_close_date)
           VALUES ($1,$2,$3,$4,$5,$6,'Acme Add-on Modules', 15000, 'EUR', 15000, 50, '2026-05-01')`,
          [orgId, pipelineId, proposalId, company1Id, contact1Id, ownerId],
        );
        await client.query(
          `INSERT INTO crm_deals (organization_id, pipeline_id, stage_id, company_id, contact_id, owner_id, title, amount, currency, amount_eur, probability, expected_close_date)
           VALUES ($1,$2,$3,$4,$5,$6,'New Biz - Widget Co', 45000, 'EUR', 45000, 75, '2026-04-20')`,
          [orgId, pipelineId, negotiationId, company1Id, contact1Id, ownerId],
        );

        result.crm = true;
      }
    }

    // ── OKR: ensure period + sample goals ──
    let periodId: string | null = null;
    const periodRows = await client.query<{ id: string }>(
      "SELECT id FROM okr_periods WHERE organization_id = $1 AND name = 'Q2 2026' LIMIT 1",
      [orgId],
    );
    if (periodRows.rows[0]) {
      periodId = periodRows.rows[0].id;
    } else {
      const ins = await client.query<{ id: string }>(
        `INSERT INTO okr_periods (organization_id, name, start_date, end_date, is_active)
         VALUES ($1, 'Q2 2026', '2026-04-01', '2026-06-30', true) RETURNING id`,
        [orgId],
      );
      periodId = ins.rows[0]?.id ?? null;
    }

    if (periodId) {
      const goalCount = await client.query<{ c: string }>(
        'SELECT COUNT(*) as c FROM okr_goals WHERE period_id = $1',
        [periodId],
      );
      if (parseInt(goalCount.rows[0].c, 10) === 0) {
        const companyGoal = await client.query<{ id: string }>(
          `INSERT INTO okr_goals (organization_id, period_id, owner_id, level, title, description, progress, status)
           VALUES ($1, $2, $3, 'company', 'Reach €500K ARR by end of Q2', 'Company-wide revenue target', 0, 'on_track') RETURNING id`,
          [orgId, periodId, ownerId],
        );
        const companyGoalId = companyGoal.rows[0].id;

        await client.query(
          `INSERT INTO okr_key_results (goal_id, title, metric_type, target_value, start_value, current_value, unit, progress)
           VALUES ($1, 'Close 10 new enterprise deals', 'number', 10, 0, 0, 'deals', 0),
                  ($1, 'MRR from new business €50K', 'currency', 50000, 0, 0, 'EUR', 0)`,
          [companyGoalId],
        );

        const teamGoal = await client.query<{ id: string }>(
          `INSERT INTO okr_goals (organization_id, period_id, parent_goal_id, owner_id, level, title, progress, status)
           VALUES ($1, $2, $3, $4, 'team', 'Sales team: 5 qualified demos per week', 0, 'on_track') RETURNING id`,
          [orgId, periodId, companyGoalId, ownerId],
        );
        await client.query(
          `INSERT INTO okr_key_results (goal_id, title, metric_type, target_value, start_value, current_value, unit, progress)
           VALUES ($1, 'Weekly demos completed', 'number', 5, 0, 0, 'demos', 0)`,
          [teamGoal.rows[0].id],
        );

        result.okr = true;
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return result;
}

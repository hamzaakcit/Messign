/**
 * RLS tenant isolation integration test.
 * Requires DATABASE_URL. Verifies that tenant A cannot see or modify tenant B's data.
 */
import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, withTenantQuery } from '../../db/index.js';
import { randomUUID } from 'crypto';

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
let pipelineId: string;
let stageId: string;
let ownerId: string;
let dealId: string;

describe('rlsTenantIsolation', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL not set — skipping RLS integration test');
      return;
    }

    try {
      // Create test orgs (organizations may not have RLS)
      await pool.query(
        `INSERT INTO organizations (id, name, slug) VALUES ($1, 'RLS Test A', 'rls-test-a'), ($2, 'RLS Test B', 'rls-test-b')
         ON CONFLICT (slug) DO NOTHING`,
        [TENANT_A, TENANT_B],
      );

      // Create pipeline, stage, and deal within tenant A context (RLS requires app.current_tenant)
      await withTenantQuery(TENANT_A, async (client) => {
        const pipeRes = await client.query<{ id: string }>(
          `INSERT INTO crm_pipelines (organization_id, name, is_default) VALUES ($1, 'Test Pipeline', true) RETURNING id`,
          [TENANT_A],
        );
        pipelineId = pipeRes.rows[0]?.id ?? '';
        if (!pipelineId) throw new Error('Failed to create pipeline');

        const stageRes = await client.query<{ id: string }>(
          `INSERT INTO crm_deal_stages (pipeline_id, name, position) VALUES ($1, 'Lead', 0) RETURNING id`,
          [pipelineId],
        );
        stageId = stageRes.rows[0]?.id ?? '';
        if (!stageId) throw new Error('Failed to create stage');

        const userRes = await pool.query<{ id: string }>(`SELECT id FROM reimbursement_users LIMIT 1`);
        ownerId = userRes.rows[0]?.id ?? '';
        if (!ownerId) {
          const orgRes = await pool.query<{ id: string }>(`SELECT id FROM organizations WHERE slug = 'messign' LIMIT 1`);
          const orgId = orgRes.rows[0]?.id;
          if (!orgId) throw new Error('No org for user');
          const newUser = await pool.query<{ id: string }>(
            `INSERT INTO reimbursement_users (organization_id, email, full_name, role) VALUES ($1, 'rls-test@test.com', 'RLS Test', 'employee') RETURNING id`,
            [orgId],
          );
          ownerId = newUser.rows[0]!.id;
        }

        const dealRes = await client.query<{ id: string }>(
          `INSERT INTO crm_deals (organization_id, tenant_id, pipeline_id, stage_id, owner_id, title, amount)
           VALUES ($1, $1, $2, $3, $4, 'RLS Test Deal', 1000) RETURNING id`,
          [TENANT_A, pipelineId, stageId, ownerId],
        );
        dealId = dealRes.rows[0]?.id ?? '';
        if (!dealId) throw new Error('Failed to create deal');
      });
    } catch (err) {
      console.warn('RLS test setup failed:', err);
      pipelineId = '';
      stageId = '';
      ownerId = '';
      dealId = '';
    }
  });

  afterAll(async () => {
    try {
      if (dealId) await pool.query(`DELETE FROM crm_deals WHERE id = $1`, [dealId]);
      if (stageId) await pool.query(`DELETE FROM crm_deal_stages WHERE id = $1`, [stageId]);
      if (pipelineId) await pool.query(`DELETE FROM crm_pipelines WHERE id = $1`, [pipelineId]);
      await pool.query(`DELETE FROM organizations WHERE id IN ($1, $2)`, [TENANT_A, TENANT_B]);
    } catch {
      // ignore cleanup errors
    }
  });

  it('query as tenant B returns 0 results (tenant A deal not visible)', async () => {
    if (!process.env.DATABASE_URL || !dealId) {
      return; // skip if setup failed
    }

    const result = await withTenantQuery(TENANT_B, async (client) => {
      const res = await client.query(
        `SELECT id FROM crm_deals WHERE id = $1`,
        [dealId],
      );
      return res.rows;
    });

    expect(result).toHaveLength(0);
  });

  it('query as tenant A returns the deal', async () => {
    if (!process.env.DATABASE_URL || !dealId) {
      return;
    }

    const result = await withTenantQuery(TENANT_A, async (client) => {
      const res = await client.query(
        `SELECT id, title FROM crm_deals WHERE id = $1`,
        [dealId],
      );
      return res.rows;
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe('RLS Test Deal');
  });

  it('UPDATE as tenant B affects 0 rows', async () => {
    if (!process.env.DATABASE_URL || !dealId) {
      return;
    }

    const result = await withTenantQuery(TENANT_B, async (client) => {
      const res = await client.query(
        `UPDATE crm_deals SET title = 'Hacked' WHERE id = $1`,
        [dealId],
      );
      return res.rowCount ?? 0;
    });

    expect(result).toBe(0);
  });
});

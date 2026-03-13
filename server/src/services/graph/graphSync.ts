/**
 * Graph Sync — Keeps Apache AGE graph in sync with relational data via domain events.
 *
 * Syncs Person, Deal, PTORequest, Ticket vertices and ASSIGNED_TO, HAS_PTO, HANDLES edges.
 * Requires: Apache AGE extension (migration 062), messign_graph.
 */
import { pool } from '../../db/index.js';
import type { EventBus } from '../../platform/eventBus.js';

function escapeCypher(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "''");
}

function escapeCypherNum(val: unknown): string {
  if (val === null || val === undefined) return '0';
  const n = Number(val);
  return Number.isFinite(n) ? String(n) : '0';
}

async function cypherQuery(query: string): Promise<unknown[]> {
  const result = await pool.query(
    `SELECT * FROM ag_catalog.cypher('messign_graph', $1) AS (result agtype)`,
    [query],
  );
  return result.rows as unknown[];
}

export function registerGraphSyncHandlers(eventBus: EventBus): void {
  // Person from hr.employee.onboarded (userId, departmentId, role, name?)
  eventBus.on('hr.employee.onboarded', async (payload) => {
    try {
      const name = payload.name ?? payload.userId;
      await cypherQuery(`
        CREATE (:Person {
          id: '${escapeCypher(payload.userId)}',
          name: '${escapeCypher(name)}',
          role: '${escapeCypher(payload.role)}',
          department: '${escapeCypher(payload.departmentId)}',
          tenant_id: '${escapeCypher(payload.organizationId ?? '')}'
        })
      `);
    } catch (err) {
      console.error('[GraphSync] hr.employee.onboarded', err);
    }
  });

  // Person from hr.employee.created (if emitted elsewhere)
  eventBus.on('hr.employee.created', async (payload) => {
    try {
      await cypherQuery(`
        CREATE (:Person {
          id: '${escapeCypher(payload.userId)}',
          name: '${escapeCypher(payload.name)}',
          role: '${escapeCypher(payload.role)}',
          department: '${escapeCypher(payload.department)}',
          tenant_id: '${escapeCypher(payload.tenantId)}'
        })
      `);
    } catch (err) {
      console.error('[GraphSync] hr.employee.created', err);
    }
  });

  // Deal + ASSIGNED_TO from crm.deal.created (owner is assignee)
  eventBus.on('crm.deal.created', async (payload) => {
    try {
      const tenantId = 'tenantId' in payload ? String((payload as { tenantId?: string }).tenantId ?? '') : '';
      await cypherQuery(`
        CREATE (:Deal {
          id: '${escapeCypher(payload.dealId)}',
          name: '${escapeCypher(payload.title)}',
          value: ${escapeCypherNum(payload.amount)},
          stage: 'created',
          tenant_id: '${escapeCypher(tenantId)}'
        })
      `);
      // Create ASSIGNED_TO if Person exists
      const since = new Date().toISOString().slice(0, 10);
      await cypherQuery(`
        MATCH (p:Person {id: '${escapeCypher(payload.ownerId)}'}), (d:Deal {id: '${escapeCypher(payload.dealId)}'})
        CREATE (p)-[:ASSIGNED_TO {role: 'owner', since: '${escapeCypher(since)}'}]->(d)
      `);
    } catch (err) {
      console.error('[GraphSync] crm.deal.created', err);
    }
  });

  // ASSIGNED_TO when deal is explicitly assigned
  eventBus.on('crm.deal.assigned', async (payload) => {
    try {
      const since = new Date().toISOString().slice(0, 10);
      await cypherQuery(`
        MATCH (p:Person {id: '${escapeCypher(payload.assigneeId)}'}), (d:Deal {id: '${escapeCypher(payload.dealId)}'})
        CREATE (p)-[:ASSIGNED_TO {role: '${escapeCypher(payload.role ?? 'member')}', since: '${escapeCypher(since)}'}]->(d)
      `);
    } catch (err) {
      console.error('[GraphSync] crm.deal.assigned', err);
    }
  });

  // PTO request approved
  eventBus.on('hr.pto.approved', async (payload) => {
    try {
      await cypherQuery(`
        MATCH (p:Person {id: '${escapeCypher(payload.userId)}'})
        CREATE (p)-[:HAS_PTO {start_date: '${escapeCypher(payload.startDate)}', end_date: '${escapeCypher(payload.endDate)}'}]->(
          :PTORequest {id: '${escapeCypher(payload.ptoId)}', status: 'approved', days: ${escapeCypherNum(payload.days)}}
        )
      `);
    } catch (err) {
      console.error('[GraphSync] hr.pto.approved', err);
    }
  });

  // Deal stage/value update
  eventBus.on('crm.deal.stage_changed', async (payload) => {
    try {
      await cypherQuery(`
        MATCH (d:Deal {id: '${escapeCypher(payload.dealId)}'})
        SET d.stage = '${escapeCypher(payload.newStage)}', d.value = ${escapeCypherNum(payload.amount)}
        RETURN d
      `);
    } catch (err) {
      console.error('[GraphSync] crm.deal.stage_changed', err);
    }
  });

  // Support ticket assigned → Person HANDLES Ticket
  eventBus.on('support.ticket.assigned', async (payload) => {
    try {
      const priority = 'priority' in payload ? escapeCypher(String((payload as { priority?: string }).priority ?? 'medium')) : 'medium';
      const tenantId = 'tenantId' in payload ? escapeCypher(String((payload as { tenantId?: string }).tenantId ?? '')) : '';
      await cypherQuery(`
        MATCH (p:Person {id: '${escapeCypher(payload.assigneeId)}'})
        MERGE (t:Ticket {id: '${escapeCypher(payload.ticketId)}'})
        SET t.priority = '${priority}', t.tenant_id = '${tenantId}'
        CREATE (p)-[:HANDLES]->(t)
        RETURN t
      `);
    } catch (err) {
      console.error('[GraphSync] support.ticket.assigned', err);
    }
  });

  console.log('[GraphSync] Handlers registered');
}

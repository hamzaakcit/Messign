import crypto from 'crypto';
import { query } from '../../db/index.js';

export interface AuditEvent {
  organization_id: string;
  event_type: string;
  event_category: string;
  actor_type: 'user' | 'ai' | 'system';
  actor_id?: string;
  actor_name?: string;
  entity_type: string;
  entity_id: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ai_involved?: boolean;
  ai_confidence?: number;
  ai_reasoning?: string;
}

export const auditService = {
  async log(event: AuditEvent): Promise<void> {
    try {
      const prev = await query<{ event_hash: string }>(
        'SELECT event_hash FROM finance_audit_log WHERE organization_id = $1 ORDER BY id DESC LIMIT 1',
        [event.organization_id],
      );
      const previousHash = prev.rows[0]?.event_hash || '0'.repeat(64);

      const eventData = JSON.stringify({
        ...event,
        previous_hash: previousHash,
        timestamp: new Date().toISOString(),
      });
      const eventHash = crypto.createHash('sha256').update(eventData).digest('hex');

      await query(
        `INSERT INTO finance_audit_log
         (organization_id, event_type, event_category, actor_type, actor_id, actor_name,
          entity_type, entity_id, changes, metadata, ai_involved, ai_confidence, ai_reasoning,
          event_hash, previous_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          event.organization_id,
          event.event_type,
          event.event_category,
          event.actor_type,
          event.actor_id ?? null,
          event.actor_name ?? null,
          event.entity_type,
          event.entity_id,
          event.changes ? JSON.stringify(event.changes) : null,
          event.metadata ? JSON.stringify(event.metadata) : null,
          event.ai_involved ?? false,
          event.ai_confidence ?? null,
          event.ai_reasoning ?? null,
          eventHash,
          previousHash,
        ],
      );
    } catch (err) {
      console.error('[auditService.log]', err);
    }
  },

  async getLog(
    orgId: string,
    filters: {
      entity_type?: string;
      entity_id?: string;
      actor_type?: string;
      event_category?: string;
      severity?: string;
      date_from?: string;
      date_to?: string;
      search?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const conditions = ['organization_id = $1'];
    const params: unknown[] = [orgId];
    let idx = 2;

    if (filters.entity_type) {
      conditions.push(`entity_type = $${idx++}`);
      params.push(filters.entity_type);
    }
    if (filters.entity_id) {
      conditions.push(`entity_id = $${idx++}`);
      params.push(filters.entity_id);
    }
    if (filters.actor_type) {
      conditions.push(`actor_type = $${idx++}`);
      params.push(filters.actor_type);
    }
    if (filters.event_category) {
      conditions.push(`event_category = $${idx++}`);
      params.push(filters.event_category);
    }
    if (filters.severity) {
      conditions.push(`severity = $${idx++}`);
      params.push(filters.severity);
    }
    if (filters.date_from) {
      conditions.push(`created_at >= $${idx++}::timestamptz`);
      params.push(filters.date_from);
    }
    if (filters.date_to) {
      conditions.push(`created_at <= ($${idx++}::date + INTERVAL '1 day')`);
      params.push(filters.date_to);
    }
    if (filters.search) {
      conditions.push(`(event_type ILIKE $${idx} OR entity_type ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const result = await query(
      `SELECT * FROM finance_audit_log
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );

    const countResult = await query(
      `SELECT COUNT(*) as total FROM finance_audit_log WHERE ${conditions.join(' AND ')}`,
      params,
    );

    return { entries: result.rows, total: parseInt(countResult.rows[0]?.total ?? '0') };
  },

  async verifyHashChain(orgId: string, count = 100): Promise<{ valid: boolean; brokenAt?: number }> {
    const result = await query(
      `SELECT id, event_hash, previous_hash FROM finance_audit_log
       WHERE organization_id = $1 ORDER BY id DESC LIMIT $2`,
      [orgId, count],
    );
    const entries = result.rows.reverse();
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].previous_hash !== entries[i - 1].event_hash) {
        return { valid: false, brokenAt: i };
      }
    }
    return { valid: true };
  },
};

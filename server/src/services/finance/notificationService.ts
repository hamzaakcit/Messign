import { query } from '../../db/index.js';
import { emitToUser } from '../../sockets/index.js';

export interface CreateNotificationInput {
  organization_id: string;
  /** Defaults to organization_id when omitted (matches multi-tenant column on finance_notifications). */
  tenant_id?: string;
  recipient_id: string;
  type: string;
  title: string;
  message: string;
  entity_type?: string;
  entity_id?: string;
  action_url?: string;
  priority?: 'low' | 'medium' | 'normal' | 'high' | 'urgent';
  ai_generated?: boolean;
}

export const notificationService = {
  async create(input: CreateNotificationInput) {
    const tenantId = input.tenant_id ?? input.organization_id;
    const result = await query(
      `INSERT INTO finance_notifications
       (organization_id, tenant_id, recipient_id, type, title, message, entity_type, entity_id,
        action_url, priority, ai_generated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        input.organization_id,
        tenantId,
        input.recipient_id,
        input.type,
        input.title,
        input.message,
        input.entity_type ?? null,
        input.entity_id ?? null,
        input.action_url ?? null,
        (input.priority === 'medium' ? 'normal' : input.priority) ?? 'normal',
        input.ai_generated ?? false,
      ],
    );

    const notification = result.rows[0];

    emitToUser(input.recipient_id, 'finance:notification', {
      id: notification.id,
      type: input.type,
      title: input.title,
      message: input.message,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      action_url: input.action_url,
      priority: (input.priority === 'medium' ? 'normal' : input.priority) ?? 'normal',
      ai_generated: input.ai_generated ?? false,
      created_at: notification.created_at,
    });

    return notification;
  },

  async getForUser(userId: string, limit = 50, offset = 0, unreadOnly = false) {
    const conditions = ['recipient_id = $1'];
    const params: unknown[] = [userId];
    let idx = 2;
    if (unreadOnly) {
      conditions.push('is_read = FALSE');
    }
    const result = await query(
      `SELECT * FROM finance_notifications
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset],
    );
    return result.rows;
  },

  async markRead(notifId: string, userId: string) {
    await query(
      'UPDATE finance_notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1 AND recipient_id = $2',
      [notifId, userId],
    );
  },

  async markAllRead(userId: string) {
    await query(
      'UPDATE finance_notifications SET is_read = TRUE, read_at = NOW() WHERE recipient_id = $1 AND is_read = FALSE',
      [userId],
    );
  },

  async getUnreadCount(userId: string): Promise<number> {
    const result = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM finance_notifications WHERE recipient_id = $1 AND is_read = FALSE',
      [userId],
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  },
};

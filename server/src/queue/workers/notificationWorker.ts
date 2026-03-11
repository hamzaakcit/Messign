import { Worker, Job } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { redisConnection } from '../connection.js';
import { query } from '../../db/index.js';
import { emitToUser } from '../../sockets/index.js';

const connection = redisConnection as unknown as ConnectionOptions;

interface NotificationJob {
  userId?: string;
  userIds?: string[];
  expenseId?: string;
  eventType?: string;
  type?: string;
  title: string;
  message: string;
  link?: string;
  module?: string;
  severity?: 'info' | 'warning' | 'critical' | 'success';
  channel: 'in_app' | 'email' | 'both';
}

async function resolveRecipientIds(job: NotificationJob): Promise<string[]> {
  const recipients = new Set<string>();
  if (job.userId) recipients.add(job.userId);
  for (const id of job.userIds ?? []) recipients.add(id);
  if (job.expenseId && recipients.size === 0) {
    const owner = await query<{ submitted_by: string }>(
      `SELECT submitted_by::text FROM reimbursement_requests WHERE id = $1::uuid LIMIT 1`,
      [job.expenseId],
    );
    if (owner.rows[0]?.submitted_by) recipients.add(owner.rows[0].submitted_by);
  }
  return Array.from(recipients);
}

async function isInAppEnabled(userId: string, eventType: string): Promise<boolean> {
  const pref = await query<{ in_app: boolean }>(
    `SELECT in_app
     FROM notification_preferences
     WHERE user_id = $1::uuid
       AND event_type = $2
     LIMIT 1`,
    [userId, eventType],
  );
  if (!pref.rows.length) return true;
  return pref.rows[0]?.in_app !== false;
}

const worker = new Worker<NotificationJob>(
  'notifications',
  async (job: Job<NotificationJob>) => {
    const { title, message, link, channel } = job.data;
    const eventType = job.data.eventType ?? job.data.type ?? 'system.notification';
    const recipients = await resolveRecipientIds(job.data);
    if (!recipients.length) {
      console.log(`[Notifications] Skipping ${eventType}: no recipients`);
      return;
    }

    for (const userId of recipients) {
      const inAppEnabled = await isInAppEnabled(userId, eventType);
      if ((channel === 'in_app' || channel === 'both') && inAppEnabled) {
        const inserted = await query<{
          id: string;
          type: string;
          title: string;
          message: string | null;
          link: string | null;
          module: string | null;
          severity: string | null;
          is_read: boolean;
          created_at: string;
        }>(
          `INSERT INTO notifications (user_id, type, title, message, link, module, severity)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
           RETURNING id::text, type, title, message, link, module, severity, is_read, created_at::text`,
          [
            userId,
            eventType,
            title,
            message,
            link ?? null,
            job.data.module ?? null,
            job.data.severity ?? 'info',
          ],
        );
        const notification = inserted.rows[0];
        await emitToUser(userId, 'notification:new', {
          userId,
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          link: notification.link,
          module: notification.module,
          severity: notification.severity,
          isRead: notification.is_read,
          createdAt: notification.created_at,
        });
      }

      if (channel === 'email' || channel === 'both') {
        console.log(`[Notifications] Email queued for ${userId} (${eventType})`);
      }
    }
  },
  { connection, concurrency: 10 },
);

worker.on('error', (err) => console.warn('[Notifications] Worker error (Redis?):', err.message));
worker.on('completed', (job) => console.log(`[Notifications] Job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`[Notifications] Job ${job?.id} failed:`, err.message));

export default worker;

import { v4 as uuidv4 } from 'uuid';
import { query } from '../../../db/index.js';
import type {
  PendingAction,
  WriteActionType,
  ActionDisplayField,
} from './types.js';

const ACTION_TTL_MS = 15 * 60 * 1000;
const MAX_PENDING_PER_USER = 10;

export async function setupActionSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS pending_actions (
      token           UUID PRIMARY KEY,
      action_type     TEXT NOT NULL,
      payload         JSONB NOT NULL,
      description     TEXT NOT NULL,
      display_fields  JSONB NOT NULL DEFAULT '[]',
      editable_fields TEXT[] NOT NULL DEFAULT '{}',
      user_id         UUID NOT NULL,
      origin_query    TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'confirmed', 'cancelled', 'expired', 'executed')),
      confirmed_payload JSONB,
      expires_at      TIMESTAMPTZ NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at    TIMESTAMPTZ,
      executed_at     TIMESTAMPTZ
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_pending_user ON pending_actions (user_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pending_expiry ON pending_actions (expires_at) WHERE status = 'pending'`);

  console.log('[ActionStore] Schema setup complete.');
}

export async function createPendingAction(
  userId: string,
  actionType: WriteActionType,
  payload: Record<string, unknown>,
  description: string,
  displayFields: ActionDisplayField[],
  editableFields: string[],
  originQuery: string,
): Promise<PendingAction> {
  const countResult = await query(
    `SELECT COUNT(*) as count FROM pending_actions WHERE user_id = $1 AND status = 'pending'`,
    [userId],
  );
  const pendingCount = parseInt(countResult.rows[0]?.count || '0');

  if (pendingCount >= MAX_PENDING_PER_USER) {
    await query(
      `UPDATE pending_actions SET status = 'expired'
       WHERE user_id = $1 AND status = 'pending'
       AND token IN (
         SELECT token FROM pending_actions
         WHERE user_id = $1 AND status = 'pending'
         ORDER BY created_at ASC LIMIT 3
       )`,
      [userId],
    );
  }

  const token = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACTION_TTL_MS);

  const action: PendingAction = {
    token,
    actionType,
    payload,
    description,
    displayFields,
    editableFields,
    userId,
    expiresAt: expiresAt.toISOString(),
    status: 'pending',
    createdAt: now.toISOString(),
    originQuery,
  };

  await query(
    `INSERT INTO pending_actions (token, action_type, payload, description, display_fields,
       editable_fields, user_id, origin_query, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)`,
    [
      token,
      actionType,
      JSON.stringify(payload),
      description,
      JSON.stringify(displayFields),
      editableFields,
      userId,
      originQuery,
      expiresAt.toISOString(),
    ],
  );

  console.log(
    `[ActionStore] Created pending action: ${actionType} (token: ${token.substring(0, 8)}..., ` +
    `user: ${userId}, expires: ${expiresAt.toISOString()})`,
  );

  return action;
}

export async function validateAndConsume(
  token: string,
  userId: string,
  editedPayload: Record<string, unknown>,
): Promise<{
  valid: boolean;
  action: PendingAction | null;
  error?: string;
}> {
  const result = await query(
    `SELECT * FROM pending_actions WHERE token = $1`,
    [token],
  );

  const row = result.rows[0] as Record<string, unknown> | undefined;

  if (!row) {
    return { valid: false, action: null, error: 'Action not found. It may have already been processed.' };
  }

  if (row.user_id !== userId) {
    console.warn(`[ActionStore] Token ownership mismatch: token user=${row.user_id}, request user=${userId}`);
    return { valid: false, action: null, error: 'This action belongs to another user.' };
  }

  if (row.status !== 'pending') {
    const messages: Record<string, string> = {
      confirmed: 'This action has already been confirmed.',
      cancelled: 'This action was cancelled.',
      expired: 'This action has expired. Please ask Dora again.',
      executed: 'This action has already been executed.',
    };
    return { valid: false, action: null, error: messages[row.status as string] || 'Invalid action status.' };
  }

  if (new Date(row.expires_at as string) < new Date()) {
    await query(`UPDATE pending_actions SET status = 'expired' WHERE token = $1`, [token]);
    return { valid: false, action: null, error: 'This action has expired. Please ask Dora again.' };
  }

  const updateResult = await query(
    `UPDATE pending_actions
     SET status = 'confirmed', confirmed_payload = $1, confirmed_at = NOW()
     WHERE token = $2 AND status = 'pending'
     RETURNING *`,
    [JSON.stringify(editedPayload), token],
  );

  if (updateResult.rows.length === 0) {
    return { valid: false, action: null, error: 'This action was already processed.' };
  }

  const confirmedRow = updateResult.rows[0] as Record<string, unknown>;

  return {
    valid: true,
    action: {
      token: confirmedRow.token as string,
      actionType: confirmedRow.action_type as WriteActionType,
      payload: (confirmedRow.confirmed_payload || confirmedRow.payload) as Record<string, unknown>,
      description: confirmedRow.description as string,
      displayFields: confirmedRow.display_fields as ActionDisplayField[],
      editableFields: confirmedRow.editable_fields as string[],
      userId: confirmedRow.user_id as string,
      expiresAt: String(confirmedRow.expires_at),
      status: 'confirmed',
      createdAt: String(confirmedRow.created_at),
      originQuery: confirmedRow.origin_query as string,
    },
  };
}

export async function markExecuted(token: string): Promise<void> {
  await query(
    `UPDATE pending_actions SET status = 'executed', executed_at = NOW() WHERE token = $1`,
    [token],
  );
}

export async function cancelAction(token: string, userId: string): Promise<boolean> {
  const result = await query(
    `UPDATE pending_actions SET status = 'cancelled'
     WHERE token = $1 AND user_id = $2 AND status = 'pending'
     RETURNING token`,
    [token, userId],
  );
  return result.rows.length > 0;
}

export async function expireStaleActions(): Promise<number> {
  const result = await query(
    `UPDATE pending_actions SET status = 'expired'
     WHERE status = 'pending' AND expires_at < NOW()
     RETURNING token`,
  );
  const count = result.rows.length;
  if (count > 0) {
    console.log(`[ActionStore] Expired ${count} stale pending actions.`);
  }
  return count;
}

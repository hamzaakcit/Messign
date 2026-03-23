import { v4 as uuidv4 } from 'uuid';
import { query, sanitizeUuid } from '../../../db/index.js';
import type {
  PendingAction,
  WriteActionType,
  ActionDisplayField,
} from './types.js';

// pending_actions.user_id is UUID-typed; sanitizeUuid() maps legacy `user-hamza` to the dev canonical id.
const ACTION_TTL_MS = 15 * 60 * 1000;
const MAX_PENDING_PER_USER = 10;

export async function setupActionSchema(): Promise<void> {
  try {
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

  await query(`ALTER TABLE pending_actions ADD COLUMN IF NOT EXISTS organization_id UUID`);
  await query(`ALTER TABLE pending_actions ADD COLUMN IF NOT EXISTS idempotency_key TEXT`);

  await query(`CREATE INDEX IF NOT EXISTS idx_pending_user ON pending_actions (user_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_pending_expiry ON pending_actions (expires_at) WHERE status = 'pending'`);
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_idem_pending ON pending_actions (organization_id, user_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND status = 'pending'`,
  );

  await query(`
    CREATE TABLE IF NOT EXISTS ai_hitl_idempotency (
      organization_id UUID NOT NULL,
      auth_user_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      action_type TEXT NOT NULL,
      success BOOLEAN NOT NULL,
      message TEXT NOT NULL,
      result_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (organization_id, auth_user_id, idempotency_key)
    )
  `);

    console.log('[FIX-2] [ActionStore] Schema setup complete.');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[FIX-2] [ActionStore] Skipped schema setup (permission or existing DDL):', msg);
  }
}

function rowToPendingAction(row: Record<string, unknown>, statusOverride?: PendingAction['status']): PendingAction {
  return {
    token: String(row.token),
    actionType: row.action_type as WriteActionType,
    payload: (row.payload as Record<string, unknown>) ?? {},
    description: String(row.description),
    displayFields: (row.display_fields as ActionDisplayField[]) ?? [],
    editableFields: Array.isArray(row.editable_fields) ? (row.editable_fields as string[]) : [],
    userId: String(row.user_id),
    organizationId: row.organization_id != null ? String(row.organization_id) : null,
    idempotencyKey: row.idempotency_key != null ? String(row.idempotency_key) : null,
    expiresAt: String(row.expires_at),
    status: statusOverride ?? (row.status as PendingAction['status']),
    createdAt: String(row.created_at),
    originQuery: String(row.origin_query),
  };
}

export async function getHitlIdempotencyResult(
  organizationId: string,
  authUserId: string,
  idempotencyKey: string,
): Promise<{ success: boolean; message: string; result: Record<string, unknown> | null } | null> {
  const res = await query<{
    success: boolean;
    message: string;
    result_json: Record<string, unknown> | null;
  }>(
    `SELECT success, message, result_json FROM ai_hitl_idempotency
     WHERE organization_id = $1::uuid AND auth_user_id = $2 AND idempotency_key = $3`,
    [organizationId, authUserId, idempotencyKey],
  );
  const row = res.rows[0];
  if (!row) return null;
  return { success: row.success, message: row.message, result: row.result_json };
}

export async function recordHitlIdempotencyResult(
  organizationId: string,
  authUserId: string,
  idempotencyKey: string,
  actionType: string,
  success: boolean,
  message: string,
  result: Record<string, unknown> | null,
): Promise<void> {
  await query(
    `INSERT INTO ai_hitl_idempotency (organization_id, auth_user_id, idempotency_key, action_type, success, message, result_json)
     VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (organization_id, auth_user_id, idempotency_key) DO NOTHING`,
    [organizationId, authUserId, idempotencyKey, actionType, success, message, result ? JSON.stringify(result) : null],
  );
}

export async function createPendingAction(
  userId: string,
  actionType: WriteActionType,
  payload: Record<string, unknown>,
  description: string,
  displayFields: ActionDisplayField[],
  editableFields: string[],
  originQuery: string,
  options?: { organizationId?: string | null; idempotencyKey?: string | null },
): Promise<PendingAction> {
  const userIdUuid = sanitizeUuid(userId);
  const organizationId = options?.organizationId?.trim() || null;
  const idempotencyKey = options?.idempotencyKey?.trim() || null;

  if (organizationId && idempotencyKey) {
    const existing = await query(
      `SELECT * FROM pending_actions
       WHERE organization_id = $1::uuid AND user_id = $2 AND idempotency_key = $3 AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [organizationId, userIdUuid, idempotencyKey],
    );
    const erow = existing.rows[0] as Record<string, unknown> | undefined;
    if (erow) {
      console.log(
        `[ActionStore] Reusing pending action for idempotency key (token: ${String(erow.token).substring(0, 8)}...)`,
      );
      return rowToPendingAction(erow, 'pending');
    }
  }

  const countResult = await query(
    `SELECT COUNT(*) as count FROM pending_actions WHERE user_id = $1 AND status = 'pending'`,
    [userIdUuid],
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
      [userIdUuid],
    );
  }

  const token = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACTION_TTL_MS);

  await query(
    `INSERT INTO pending_actions (token, action_type, payload, description, display_fields,
       editable_fields, user_id, origin_query, status, expires_at, organization_id, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10::uuid, $11)`,
    [
      token,
      actionType,
      JSON.stringify(payload),
      description,
      JSON.stringify(displayFields),
      editableFields,
      userIdUuid,
      originQuery,
      expiresAt.toISOString(),
      organizationId,
      idempotencyKey,
    ],
  );

  const action: PendingAction = {
    token,
    actionType,
    payload,
    description,
    displayFields,
    editableFields,
    userId,
    organizationId,
    idempotencyKey,
    expiresAt: expiresAt.toISOString(),
    status: 'pending',
    createdAt: now.toISOString(),
    originQuery,
  };

  console.log(
    `[ActionStore] Created pending action: ${actionType} (token: ${token.substring(0, 8)}..., ` +
      `user: ${userId}, org: ${organizationId ?? '—'}, expires: ${expiresAt.toISOString()})`,
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
  const userIdUuid = sanitizeUuid(userId);
  const result = await query(
    `SELECT * FROM pending_actions WHERE token = $1`,
    [token],
  );

  const row = result.rows[0] as Record<string, unknown> | undefined;

  if (!row) {
    return { valid: false, action: null, error: 'Action not found. It may have already been processed.' };
  }

  if (String(row.user_id) !== userIdUuid) {
    console.warn(`[ActionStore] Token ownership mismatch: token user=${row.user_id}, request user=${userId}`);
    return { valid: false, action: null, error: 'This action belongs to another user.' };
  }

  const userOrgRes = await query<{ organization_id: string | null }>(
    `SELECT organization_id::text AS organization_id FROM reimbursement_users WHERE auth_user_id = $1 LIMIT 1`,
    [userId],
  );
  const actorOrgId = userOrgRes.rows[0]?.organization_id ?? null;
  if (row.organization_id != null && actorOrgId != null && String(row.organization_id) !== String(actorOrgId)) {
    return { valid: false, action: null, error: 'This action belongs to another organization.' };
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

  const originalPayload = (row.payload as Record<string, unknown>) ?? {};
  const editableFields = Array.isArray(row.editable_fields)
    ? (row.editable_fields as string[])
    : [];
  const sanitizedEdits: Record<string, unknown> = {};
  for (const key of editableFields) {
    if (Object.prototype.hasOwnProperty.call(editedPayload, key)) {
      sanitizedEdits[key] = editedPayload[key];
    }
  }
  const mergedPayload: Record<string, unknown> = { ...originalPayload, ...sanitizedEdits };
  const validationError = validatePayloadForAction(row.action_type as WriteActionType, mergedPayload);
  if (validationError) {
    return { valid: false, action: null, error: validationError };
  }

  const updateResult = await query(
    `UPDATE pending_actions
     SET status = 'confirmed', confirmed_payload = $1, confirmed_at = NOW()
     WHERE token = $2 AND status = 'pending'
     RETURNING *`,
    [JSON.stringify(mergedPayload), token],
  );

  if (updateResult.rows.length === 0) {
    return { valid: false, action: null, error: 'This action was already processed.' };
  }

  const confirmedRow = updateResult.rows[0] as Record<string, unknown>;

  return {
    valid: true,
    action: {
      ...rowToPendingAction(confirmedRow, 'confirmed'),
      payload: (confirmedRow.confirmed_payload || confirmedRow.payload) as Record<string, unknown>,
    },
  };
}

function validatePayloadForAction(actionType: WriteActionType, payload: Record<string, unknown>): string | null {
  const required: Partial<Record<WriteActionType, string[]>> = {
    'finance:approve_expense': ['reimbursement_id'],
    'finance:flag_expense': ['reimbursement_id', 'reason'],
    'finance:create_budget': ['department', 'allocated_amount', 'period_start', 'period_end'],
    'finance:update_budget': ['budget_id'],
    'finance:auto_approve_expense': ['expense_id'],
    'finance:flag_expense_for_review': ['expense_id', 'reason'],
    'finance:generate_invoice': ['client_name'],
    'finance:send_payment_reminder': ['invoice_id'],
    'crm:create_deal': ['title', 'amount', 'companyName'],
    'support:create_ticket': ['subject', 'description'],
    'assets:assign_asset': ['assetName', 'employeeName'],
    'contracts:send_renewal_reminder': ['contractName'],
    'marketing:create_campaign': ['name', 'channel', 'budget'],
    'recruitment:post_job': ['title', 'department', 'description'],
  };
  const requiredFields = required[actionType] ?? [];
  for (const field of requiredFields) {
    const value = payload[field];
    if (value == null || String(value).trim() === '') {
      return `Missing required field: ${field}`;
    }
  }
  return null;
}

export async function markExecuted(token: string): Promise<void> {
  await query(
    `UPDATE pending_actions SET status = 'executed', executed_at = NOW() WHERE token = $1`,
    [token],
  );
}

export async function cancelAction(token: string, userId: string): Promise<boolean> {
  const userIdUuid = sanitizeUuid(userId);
  const sel = await query(
    `SELECT user_id, organization_id FROM pending_actions WHERE token = $1 AND status = 'pending'`,
    [token],
  );
  const row = sel.rows[0] as { user_id: string; organization_id: string | null } | undefined;
  if (!row || String(row.user_id) !== userIdUuid) {
    return false;
  }
  const userOrgRes = await query<{ organization_id: string | null }>(
    `SELECT organization_id::text AS organization_id FROM reimbursement_users WHERE auth_user_id = $1 LIMIT 1`,
    [userId],
  );
  const actorOrgId = userOrgRes.rows[0]?.organization_id ?? null;
  if (row.organization_id != null && actorOrgId != null && String(row.organization_id) !== String(actorOrgId)) {
    return false;
  }
  const result = await query(
    `UPDATE pending_actions SET status = 'cancelled'
     WHERE token = $1 AND user_id = $2 AND status = 'pending'
     RETURNING token`,
    [token, userIdUuid],
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

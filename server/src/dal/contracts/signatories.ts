import { query } from '../../db/index.js';
import { eventBus } from '../../events/index.js';
import type { CallerContext } from '../types.js';

export interface Signatory {
  id: string;
  contract_id: string;
  name: string;
  email: string;
  role: string | null;
  signing_order: number;
  status: string;
  signed_at: string | null;
  signature_data: string | null;
  ip_address: string | null;
  reminder_sent_at: string | null;
  created_at: string;
}

function mapSignatory(row: Record<string, unknown>): Signatory {
  return {
    id: String(row.id),
    contract_id: String(row.contract_id),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    role: row.role ? String(row.role) : null,
    signing_order: Number(row.signing_order ?? 1),
    status: String(row.status ?? 'pending'),
    signed_at: row.signed_at ? String(row.signed_at) : null,
    signature_data: row.signature_data ? String(row.signature_data) : null,
    ip_address: row.ip_address ? String(row.ip_address) : null,
    reminder_sent_at: row.reminder_sent_at ? String(row.reminder_sent_at) : null,
    created_at: String(row.created_at),
  };
}

export async function addSignatory(
  ctx: CallerContext,
  contractId: string,
  data: { name: string; email: string; role?: string; signing_order?: number },
): Promise<Signatory> {
  const result = await query<Record<string, unknown>>(
    `INSERT INTO contract_signatories (contract_id, name, email, role, signing_order)
     VALUES ($1::uuid, $2, $3, $4, COALESCE($5, 1))
     RETURNING *`,
    [contractId, data.name, data.email, data.role ?? null, data.signing_order ?? 1],
  );
  return mapSignatory(result.rows[0]);
}

export async function recordSignature(
  ctx: CallerContext,
  signatoryId: string,
  signatureData: string,
  ipAddress?: string,
): Promise<Signatory> {
  const result = await query<Record<string, unknown>>(
    `UPDATE contract_signatories
     SET status = 'signed', signed_at = NOW(), signature_data = $2, ip_address = $3
     WHERE id = $1::uuid
     RETURNING *`,
    [signatoryId, signatureData, ipAddress ?? null],
  );
  if (!result.rows[0]) throw new Error('Signatory not found');
  const signatory = mapSignatory(result.rows[0]);
  const contractResult = await query<Record<string, unknown>>(
    `SELECT c.id, c.title, COUNT(cs.id) FILTER (WHERE cs.status = 'signed')::int AS signed_count, COUNT(cs.id)::int AS total_count
     FROM contracts c
     JOIN contract_signatories cs ON cs.contract_id = c.id
     WHERE cs.contract_id = $1::uuid
     GROUP BY c.id, c.title`,
    [signatory.contract_id],
  );
  const c = contractResult.rows[0];
  if (c) {
    const allPartiesSigned = Number(c.signed_count ?? 0) >= Number(c.total_count ?? 0) && Number(c.total_count ?? 0) > 0;
    eventBus.emit('contract.signed', {
      contractId: String(c.id),
      signedBy: ctx.userId,
      signedAt: new Date().toISOString(),
      allPartiesSigned,
    });
    if (allPartiesSigned) {
      await query(`UPDATE contracts SET status = 'active', signed_date = CURRENT_DATE, updated_at = NOW() WHERE id = $1::uuid`, [c.id]);
    }
  }
  return signatory;
}

export async function sendReminder(_ctx: CallerContext, signatoryId: string): Promise<void> {
  await query(
    `UPDATE contract_signatories SET reminder_sent_at = NOW() WHERE id = $1::uuid`,
    [signatoryId],
  );
}

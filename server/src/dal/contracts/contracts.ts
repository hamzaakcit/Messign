import { query } from '../../db/index.js';
import { eventBus } from '../../events/index.js';
import type { CallerContext, DateRange, PaginatedResult, SortOptions } from '../types.js';
import { paginationClause } from '../helpers.js';
import { ANALYTICS_VIEWS, refreshMaterializedViews } from '../../services/analytics/materializedViews.js';
import { stripPII } from '../../services/ai/piiStripper.js';

export interface Contract {
  id: string;
  organization_id: string | null;
  title: string;
  type: string;
  status: string;
  counterparty_name: string;
  counterparty_email: string | null;
  counterparty_type: string | null;
  crm_company_id: string | null;
  finance_vendor_id: string | null;
  employee_id: string | null;
  total_value: number | null;
  currency: string;
  total_value_eur: number | null;
  payment_terms: string | null;
  start_date: string | null;
  end_date: string | null;
  signed_date: string | null;
  effective_date: string | null;
  auto_renew: boolean;
  renewal_period_months: number | null;
  renewal_notice_days: number;
  next_renewal_date: string | null;
  document_url: string | null;
  document_text: string | null;
  dora_extracted_terms: Record<string, unknown> | null;
  dora_extraction_confidence: number | null;
  description: string | null;
  tags: string[];
  notes: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
  signatories?: Array<Record<string, unknown>>;
  obligations?: Array<Record<string, unknown>>;
  reminders?: Array<Record<string, unknown>>;
}

export interface ContractFilters {
  status?: string;
  type?: string;
  counterpartyName?: string;
  renewalStatus?: string;
  dateRange?: DateRange;
  search?: string;
}

export interface CreateContractInput {
  title: string;
  type: string;
  status?: string;
  counterparty_name: string;
  counterparty_email?: string;
  counterparty_type?: string;
  crm_company_id?: string;
  finance_vendor_id?: string;
  employee_id?: string;
  total_value?: number;
  currency?: string;
  total_value_eur?: number;
  payment_terms?: string;
  start_date?: string;
  end_date?: string;
  signed_date?: string;
  effective_date?: string;
  auto_renew?: boolean;
  renewal_period_months?: number;
  renewal_notice_days?: number;
  next_renewal_date?: string;
  document_url?: string;
  document_text?: string;
  description?: string;
  tags?: string[];
  notes?: string;
  owner_id?: string;
}

export type UpdateContractInput = Partial<CreateContractInput>;

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function mapContract(row: Record<string, unknown>): Contract {
  return {
    id: String(row.id),
    organization_id: row.organization_id ? String(row.organization_id) : null,
    title: String(row.title ?? ''),
    type: String(row.type ?? 'other'),
    status: String(row.status ?? 'draft'),
    counterparty_name: String(row.counterparty_name ?? ''),
    counterparty_email: row.counterparty_email ? String(row.counterparty_email) : null,
    counterparty_type: row.counterparty_type ? String(row.counterparty_type) : null,
    crm_company_id: row.crm_company_id ? String(row.crm_company_id) : null,
    finance_vendor_id: row.finance_vendor_id ? String(row.finance_vendor_id) : null,
    employee_id: row.employee_id ? String(row.employee_id) : null,
    total_value: row.total_value == null ? null : toNum(row.total_value),
    currency: String(row.currency ?? 'EUR'),
    total_value_eur: row.total_value_eur == null ? null : toNum(row.total_value_eur),
    payment_terms: row.payment_terms ? String(row.payment_terms) : null,
    start_date: row.start_date ? String(row.start_date) : null,
    end_date: row.end_date ? String(row.end_date) : null,
    signed_date: row.signed_date ? String(row.signed_date) : null,
    effective_date: row.effective_date ? String(row.effective_date) : null,
    auto_renew: Boolean(row.auto_renew),
    renewal_period_months: row.renewal_period_months == null ? null : toNum(row.renewal_period_months),
    renewal_notice_days: toNum(row.renewal_notice_days ?? 30),
    next_renewal_date: row.next_renewal_date ? String(row.next_renewal_date) : null,
    document_url: row.document_url ? String(row.document_url) : null,
    document_text: row.document_text ? String(row.document_text) : null,
    dora_extracted_terms: row.dora_extracted_terms && typeof row.dora_extracted_terms === 'object'
      ? row.dora_extracted_terms as Record<string, unknown>
      : null,
    dora_extraction_confidence: row.dora_extraction_confidence == null ? null : toNum(row.dora_extraction_confidence),
    description: row.description ? String(row.description) : null,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    notes: row.notes ? String(row.notes) : null,
    owner_id: row.owner_id ? String(row.owner_id) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function createRenewalReminders(contractId: string, endDate: string, ownerId?: string | null): Promise<void> {
  const days = [90, 60, 30];
  for (const d of days) {
    await query(
      `INSERT INTO contract_reminders (contract_id, reminder_days_before, reminder_date, recipient_ids)
       VALUES ($1::uuid, $2, ($3::date - ($2 || ' days')::interval)::date, $4::jsonb)`,
      [contractId, d, endDate, JSON.stringify(ownerId ? [ownerId] : [])],
    );
  }
}

export async function listContracts(
  ctx: CallerContext,
  filters?: ContractFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Contract>> {
  const conditions = ['1=1'];
  const params: unknown[] = [];
  let idx = 1;
  if (ctx.organizationId) {
    conditions.push(`c.organization_id = $${idx++}::uuid`);
    params.push(ctx.organizationId);
  }
  if (filters?.status) {
    conditions.push(`c.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.type) {
    conditions.push(`c.type = $${idx++}`);
    params.push(filters.type);
  }
  if (filters?.counterpartyName) {
    conditions.push(`c.counterparty_name ILIKE $${idx++}`);
    params.push(`%${filters.counterpartyName}%`);
  }
  if (filters?.renewalStatus) {
    conditions.push(`c.id IN (SELECT contract_id FROM mv_contract_renewals WHERE renewal_status = $${idx++})`);
    params.push(filters.renewalStatus);
  }
  if (filters?.dateRange?.from) {
    conditions.push(`c.start_date >= $${idx++}::date`);
    params.push(filters.dateRange.from);
  }
  if (filters?.dateRange?.to) {
    conditions.push(`c.end_date <= $${idx++}::date`);
    params.push(filters.dateRange.to);
  }
  if (filters?.search) {
    conditions.push(`(c.title ILIKE $${idx} OR c.counterparty_name ILIKE $${idx} OR COALESCE(c.notes, '') ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }
  const where = conditions.join(' AND ');
  const count = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM contracts c WHERE ${where}`, params);
  const total = Number(count.rows[0]?.count ?? 0);
  const pg = paginationClause(page, pageSize, idx);
  const orderMap: Record<string, string> = {
    title: 'c.title',
    type: 'c.type',
    status: 'c.status',
    end_date: 'c.end_date',
    total_value: 'c.total_value',
    created_at: 'c.created_at',
  };
  const orderBy = orderMap[sort?.field ?? 'created_at'] ?? 'c.created_at';
  const dir = sort?.direction === 'asc' ? 'ASC' : 'DESC';
  const rows = await query<Record<string, unknown>>(
    `SELECT c.* FROM contracts c WHERE ${where} ORDER BY ${orderBy} ${dir} ${pg.clause}`,
    [...params, ...pg.params],
  );
  return { data: rows.rows.map(mapContract), total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
}

export async function getContractById(ctx: CallerContext, contractId: string): Promise<Contract | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT * FROM contracts
     WHERE id = $1::uuid
       AND ($2::uuid IS NULL OR organization_id = $2::uuid)
     LIMIT 1`,
    [contractId, ctx.organizationId ?? null],
  );
  if (!result.rows[0]) return null;
  const contract = mapContract(result.rows[0]);
  const [signatories, obligations, reminders] = await Promise.all([
    query<Record<string, unknown>>(`SELECT * FROM contract_signatories WHERE contract_id = $1::uuid ORDER BY signing_order ASC, created_at ASC`, [contractId]),
    query<Record<string, unknown>>(`SELECT * FROM contract_obligations WHERE contract_id = $1::uuid ORDER BY due_date ASC NULLS LAST, created_at ASC`, [contractId]),
    query<Record<string, unknown>>(`SELECT * FROM contract_reminders WHERE contract_id = $1::uuid ORDER BY reminder_date ASC`, [contractId]),
  ]);
  contract.signatories = signatories.rows;
  contract.obligations = obligations.rows;
  contract.reminders = reminders.rows;
  return contract;
}

export async function createContract(ctx: CallerContext, data: CreateContractInput): Promise<Contract> {
  if (!ctx.organizationId) throw new Error('Organization context required');
  const result = await query<Record<string, unknown>>(
    `INSERT INTO contracts (
       organization_id, title, type, status, counterparty_name, counterparty_email, counterparty_type,
       crm_company_id, finance_vendor_id, employee_id, total_value, currency, total_value_eur, payment_terms,
       start_date, end_date, signed_date, effective_date, auto_renew, renewal_period_months, renewal_notice_days,
       next_renewal_date, document_url, document_text, description, tags, notes, owner_id
     ) VALUES (
       $1::uuid, $2, $3, COALESCE($4, 'draft'), $5, $6, $7,
       $8::uuid, $9::uuid, $10::uuid, $11, COALESCE($12, 'EUR'), $13, $14,
       $15::date, $16::date, $17::date, $18::date, COALESCE($19, FALSE), $20, COALESCE($21, 30),
       $22::date, $23, $24, $25, COALESCE($26::jsonb, '[]'::jsonb), $27, $28::uuid
     ) RETURNING *`,
    [
      ctx.organizationId,
      data.title,
      data.type,
      data.status ?? 'draft',
      data.counterparty_name,
      data.counterparty_email ?? null,
      data.counterparty_type ?? null,
      data.crm_company_id ?? null,
      data.finance_vendor_id ?? null,
      data.employee_id ?? null,
      data.total_value ?? null,
      data.currency ?? 'EUR',
      data.total_value_eur ?? data.total_value ?? null,
      data.payment_terms ?? null,
      data.start_date ?? null,
      data.end_date ?? null,
      data.signed_date ?? null,
      data.effective_date ?? null,
      data.auto_renew ?? false,
      data.renewal_period_months ?? null,
      data.renewal_notice_days ?? 30,
      data.next_renewal_date ?? null,
      data.document_url ?? null,
      data.document_text ?? null,
      data.description ?? null,
      data.tags ? JSON.stringify(data.tags) : null,
      data.notes ?? null,
      data.owner_id ?? ctx.userId,
    ],
  );
  const contract = mapContract(result.rows[0]);
  if (contract.end_date) {
    await createRenewalReminders(contract.id, contract.end_date, contract.owner_id);
  }
  eventBus.emit('contract.created', {
    contractId: contract.id,
    title: contract.title,
    type: contract.type,
    counterparty: contract.counterparty_name,
    value: contract.total_value ?? 0,
    currency: contract.currency,
  });
  await refreshMaterializedViews([ANALYTICS_VIEWS.contractRenewals]);
  return contract;
}

export async function updateContract(ctx: CallerContext, contractId: string, data: UpdateContractInput): Promise<Contract> {
  const existing = await getContractById(ctx, contractId);
  if (!existing) throw new Error('Contract not found');
  const fields: Array<[string, unknown, string?]> = [
    ['title', data.title],
    ['type', data.type],
    ['status', data.status],
    ['counterparty_name', data.counterparty_name],
    ['counterparty_email', data.counterparty_email],
    ['counterparty_type', data.counterparty_type],
    ['crm_company_id', data.crm_company_id, '::uuid'],
    ['finance_vendor_id', data.finance_vendor_id, '::uuid'],
    ['employee_id', data.employee_id, '::uuid'],
    ['total_value', data.total_value],
    ['currency', data.currency],
    ['total_value_eur', data.total_value_eur],
    ['payment_terms', data.payment_terms],
    ['start_date', data.start_date, '::date'],
    ['end_date', data.end_date, '::date'],
    ['signed_date', data.signed_date, '::date'],
    ['effective_date', data.effective_date, '::date'],
    ['auto_renew', data.auto_renew],
    ['renewal_period_months', data.renewal_period_months],
    ['renewal_notice_days', data.renewal_notice_days],
    ['next_renewal_date', data.next_renewal_date, '::date'],
    ['document_url', data.document_url],
    ['document_text', data.document_text],
    ['description', data.description],
    ['tags', data.tags ? JSON.stringify(data.tags) : undefined, '::jsonb'],
    ['notes', data.notes],
    ['owner_id', data.owner_id, '::uuid'],
  ];
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  for (const [col, val, cast] of fields) {
    if (val !== undefined) {
      sets.push(`${col} = $${idx++}${cast ?? ''}`);
      params.push(val ?? null);
    }
  }
  sets.push('updated_at = NOW()');
  params.push(contractId, ctx.organizationId ?? null);
  const result = await query<Record<string, unknown>>(
    `UPDATE contracts SET ${sets.join(', ')}
     WHERE id = $${idx++}::uuid
       AND ($${idx}::uuid IS NULL OR organization_id = $${idx}::uuid)
     RETURNING *`,
    params,
  );
  if (!result.rows[0]) throw new Error('Contract not found');
  await refreshMaterializedViews([ANALYTICS_VIEWS.contractRenewals]);
  return mapContract(result.rows[0]);
}

export async function activateContract(ctx: CallerContext, contractId: string): Promise<Contract> {
  const result = await query<Record<string, unknown>>(
    `UPDATE contracts
     SET status = 'active',
         effective_date = COALESCE(effective_date, CURRENT_DATE),
         updated_at = NOW()
     WHERE id = $1::uuid
       AND ($2::uuid IS NULL OR organization_id = $2::uuid)
     RETURNING *`,
    [contractId, ctx.organizationId ?? null],
  );
  if (!result.rows[0]) throw new Error('Contract not found');
  const contract = mapContract(result.rows[0]);
  eventBus.emit('contract.activated', {
    contractId: contract.id,
    startDate: contract.start_date ?? new Date().toISOString().slice(0, 10),
    endDate: contract.end_date ?? '',
  });
  await refreshMaterializedViews([ANALYTICS_VIEWS.contractRenewals]);
  return contract;
}

export async function terminateContract(ctx: CallerContext, contractId: string, reason: string, effectiveDate: string): Promise<Contract> {
  const result = await query<Record<string, unknown>>(
    `UPDATE contracts
     SET status = 'terminated',
         notes = COALESCE(notes, '') || $2,
         updated_at = NOW()
     WHERE id = $1::uuid
       AND ($3::uuid IS NULL OR organization_id = $3::uuid)
     RETURNING *`,
    [contractId, `\n[Terminated ${effectiveDate} by ${ctx.userId}] ${reason}`, ctx.organizationId ?? null],
  );
  if (!result.rows[0]) throw new Error('Contract not found');
  const contract = mapContract(result.rows[0]);
  eventBus.emit('contract.terminated', {
    contractId: contract.id,
    terminatedBy: ctx.userId,
    reason,
    effectiveDate,
  });
  await refreshMaterializedViews([ANALYTICS_VIEWS.contractRenewals]);
  return contract;
}

export async function renewContract(ctx: CallerContext, contractId: string, newEndDate: string, newValue?: number): Promise<Contract> {
  const contract = await getContractById(ctx, contractId);
  if (!contract) throw new Error('Contract not found');
  const result = await query<Record<string, unknown>>(
    `UPDATE contracts
     SET status = 'renewed',
         end_date = $2::date,
         total_value = COALESCE($3, total_value),
         total_value_eur = COALESCE($3, total_value_eur),
         updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING *`,
    [contractId, newEndDate, newValue ?? null],
  );
  const renewed = mapContract(result.rows[0]);
  await query(`DELETE FROM contract_reminders WHERE contract_id = $1::uuid`, [contractId]);
  await createRenewalReminders(contractId, newEndDate, renewed.owner_id);
  eventBus.emit('contract.renewed', {
    contractId,
    newContractId: contractId,
    newEndDate,
    valueChange: (newValue ?? renewed.total_value ?? 0) - (contract.total_value ?? 0),
  });
  await refreshMaterializedViews([ANALYTICS_VIEWS.contractRenewals]);
  return renewed;
}

function heuristicExtract(documentText: string): Record<string, unknown> {
  const text = documentText.toLowerCase();
  const obligations: string[] = [];
  if (text.includes('sla')) obligations.push('Maintain SLA commitments');
  if (text.includes('report')) obligations.push('Provide periodic reporting');
  if (text.includes('payment')) obligations.push('Process payments per payment terms');
  return {
    total_value: null,
    start_date: null,
    end_date: null,
    termination_clause: text.includes('termination') ? 'Termination clause present' : 'Not detected',
    renewal_terms: text.includes('renew') ? 'Renewal terms present' : 'Not detected',
    sla_commitments: text.includes('sla') ? 'SLA obligations mentioned' : 'No SLA references detected',
    key_obligations: obligations,
    confidence: 0.55,
  };
}

export async function extractTermsWithAI(ctx: CallerContext, contractId: string): Promise<Contract> {
  const contract = await getContractById(ctx, contractId);
  if (!contract) throw new Error('Contract not found');
  const docText = (contract.document_text ?? '').trim();
  if (!docText) throw new Error('No contract document_text to extract from');

  const apiKey = process.env.GROQ_API_KEY;
  let extracted: Record<string, unknown>;
  if (!apiKey) {
    extracted = heuristicExtract(docText);
  } else {
    try {
      const { sanitizedText } = stripPII(docText.slice(0, 15000));
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content:
                'Extract key terms from a contract. Return JSON with keys: total_value, start_date, end_date, termination_clause, renewal_terms, sla_commitments, key_obligations (array), confidence.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                instruction:
                  'Extract key terms from this contract: total value, start/end dates, termination clause, renewal terms, SLA commitments, key obligations.',
                contractText: sanitizedText,
              }),
            },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`Groq request failed with ${response.status}`);
      }
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const raw = payload.choices?.[0]?.message?.content;
      extracted = raw ? JSON.parse(raw) as Record<string, unknown> : heuristicExtract(docText);
    } catch {
      extracted = heuristicExtract(docText);
    }
  }

  const confidence = toNum(extracted.confidence ?? 0.6);
  await query(
    `UPDATE contracts
     SET dora_extracted_terms = $2::jsonb,
         dora_extraction_confidence = $3,
         updated_at = NOW()
     WHERE id = $1::uuid`,
    [contractId, JSON.stringify(extracted), confidence],
  );

  const obligations = Array.isArray(extracted.key_obligations) ? extracted.key_obligations.map(String) : [];
  for (const obligation of obligations.slice(0, 10)) {
    await query(
      `INSERT INTO contract_obligations (contract_id, description, obligation_type, responsible_party, status)
       VALUES ($1::uuid, $2, 'other', 'both', 'pending')`,
      [contractId, obligation],
    );
  }

  return (await getContractById(ctx, contractId)) as Contract;
}

export async function getExpiringContracts(ctx: CallerContext, withinDays: number = 90): Promise<Array<Record<string, unknown>>> {
  const result = await query<Record<string, unknown>>(
    `SELECT *
     FROM mv_contract_renewals
     WHERE days_until_expiry <= $2
       AND ($1::uuid IS NULL OR contract_id IN (SELECT id FROM contracts WHERE organization_id = $1::uuid))
     ORDER BY days_until_expiry ASC`,
    [ctx.organizationId ?? null, withinDays],
  );
  return result.rows;
}

export async function getContractMetrics(ctx: CallerContext): Promise<{
  totalActive: number;
  totalValue: number;
  expiringThisMonth: number;
  renewalsNeeded: number;
  complianceDue: number;
}> {
  const [summary, obligations] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active')::int AS total_active,
         COALESCE(SUM(total_value_eur), 0)::numeric AS total_value,
         COUNT(*) FILTER (
           WHERE end_date >= CURRENT_DATE
             AND end_date < CURRENT_DATE + INTERVAL '30 days'
         )::int AS expiring_this_month,
         COUNT(*) FILTER (WHERE auto_renew = FALSE AND status IN ('active', 'expiring'))::int AS renewals_needed
       FROM contracts
       WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)`,
      [ctx.organizationId ?? null],
    ),
    query<Record<string, unknown>>(
      `SELECT COUNT(*)::int AS compliance_due
       FROM contract_obligations co
       JOIN contracts c ON c.id = co.contract_id
       WHERE co.status IN ('pending', 'overdue')
         AND co.due_date <= CURRENT_DATE + INTERVAL '30 days'
         AND ($1::uuid IS NULL OR c.organization_id = $1::uuid)`,
      [ctx.organizationId ?? null],
    ),
  ]);
  const row = summary.rows[0] ?? {};
  return {
    totalActive: toNum(row.total_active),
    totalValue: toNum(row.total_value),
    expiringThisMonth: toNum(row.expiring_this_month),
    renewalsNeeded: toNum(row.renewals_needed),
    complianceDue: toNum(obligations.rows[0]?.compliance_due),
  };
}

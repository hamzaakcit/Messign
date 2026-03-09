import { query } from '../../db/index.js';
import { eventBus } from '../../events/index.js';
import type { CallerContext, PaginatedResult, SortOptions } from '../types.js';
import { paginationClause } from '../helpers.js';

// ── Interfaces ──

export interface Contact {
  id: string;
  organization_id: string;
  company_id: string | null;
  owner_id: string | null;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  source: string | null;
  tags: string[];
  notes: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
  company_name?: string;
  owner_name?: string;
  deals?: unknown[];
  recent_activities?: unknown[];
}

export interface CreateContactInput {
  company_id?: string;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  job_title?: string;
  source?: string;
  tags?: string[];
  notes?: string;
}

export interface ContactFilters {
  company_id?: string;
  owner_id?: string;
  source?: string;
  search?: string;
}

// ── Functions ──

export async function listContacts(
  ctx: CallerContext,
  filters?: ContactFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Contact>> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (ctx.organizationId) {
    conditions.push(`ct.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }
  if (filters?.company_id) {
    conditions.push(`ct.company_id = $${idx++}`);
    params.push(filters.company_id);
  }
  if (filters?.owner_id) {
    conditions.push(`ct.owner_id = $${idx++}`);
    params.push(filters.owner_id);
  }
  if (filters?.source) {
    conditions.push(`ct.source = $${idx++}`);
    params.push(filters.source);
  }
  if (filters?.search) {
    conditions.push(`(ct.first_name ILIKE $${idx} OR ct.last_name ILIKE $${idx} OR ct.email ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

  const sortCol: Record<string, string> = {
    name: 'ct.first_name', email: 'ct.email', created: 'ct.created_at', last_contacted: 'ct.last_contacted_at',
  };
  const orderBy = sortCol[sort?.field ?? 'name'] ?? 'ct.first_name';
  const orderDir = sort?.direction === 'desc' ? 'DESC' : 'ASC';

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM crm_contacts ct WHERE ${whereSQL}`,
    params,
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const pg = paginationClause(page, pageSize, idx);
  const dataResult = await query(
    `SELECT ct.*, co.name as company_name, u.full_name as owner_name
     FROM crm_contacts ct
     LEFT JOIN crm_companies co ON co.id = ct.company_id
     LEFT JOIN reimbursement_users u ON u.id = ct.owner_id
     WHERE ${whereSQL}
     ORDER BY ${orderBy} ${orderDir}
     ${pg.clause}`,
    [...params, ...pg.params],
  );

  return { data: dataResult.rows as Contact[], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getContactById(ctx: CallerContext, contactId: string): Promise<Contact | null> {
  const conditions = ['ct.id = $1'];
  const params: unknown[] = [contactId];
  let idx = 2;

  if (ctx.organizationId) {
    conditions.push(`ct.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }

  const result = await query(
    `SELECT ct.*, co.name as company_name, u.full_name as owner_name
     FROM crm_contacts ct
     LEFT JOIN crm_companies co ON co.id = ct.company_id
     LEFT JOIN reimbursement_users u ON u.id = ct.owner_id
     WHERE ${conditions.join(' AND ')}`,
    params,
  );
  if (!result.rows[0]) return null;

  const [dealsResult, activitiesResult] = await Promise.all([
    query(
      `SELECT d.id, d.title, d.amount, d.currency, s.name as stage_name
       FROM crm_deals d
       JOIN crm_deal_stages s ON s.id = d.stage_id
       WHERE d.contact_id = $1
       ORDER BY d.created_at DESC`,
      [contactId],
    ),
    query(
      `SELECT a.*, u.full_name as user_name
       FROM crm_activities a
       LEFT JOIN reimbursement_users u ON u.id = a.user_id
       WHERE a.contact_id = $1
       ORDER BY a.created_at DESC LIMIT 10`,
      [contactId],
    ),
  ]);

  return {
    ...result.rows[0],
    deals: dealsResult.rows,
    recent_activities: activitiesResult.rows,
  } as Contact;
}

export async function createContact(ctx: CallerContext, data: CreateContactInput): Promise<Contact> {
  const result = await query(
    `INSERT INTO crm_contacts
     (organization_id, company_id, owner_id, first_name, last_name, email, phone, job_title, source, tags, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      ctx.organizationId ?? null, data.company_id ?? null, ctx.userId,
      data.first_name, data.last_name ?? null, data.email ?? null,
      data.phone ?? null, data.job_title ?? null, data.source ?? null,
      JSON.stringify(data.tags ?? []), data.notes ?? null,
    ],
  );
  const contact = result.rows[0] as Contact;

  eventBus.emit('crm.contact.created', {
    contactId: contact.id, ownerId: ctx.userId,
    email: contact.email ?? undefined, companyId: contact.company_id ?? undefined,
  });

  return contact;
}

export async function updateContact(
  ctx: CallerContext,
  contactId: string,
  data: Partial<CreateContactInput>,
): Promise<Contact> {
  const fields: [string, unknown][] = [
    ['company_id', data.company_id], ['first_name', data.first_name],
    ['last_name', data.last_name], ['email', data.email], ['phone', data.phone],
    ['job_title', data.job_title], ['source', data.source], ['notes', data.notes],
  ];
  if (data.tags !== undefined) {
    fields.push(['tags', JSON.stringify(data.tags)]);
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  for (const [col, val] of fields) {
    if (val !== undefined) {
      sets.push(`${col} = $${idx++}`);
      params.push(val);
    }
  }
  sets.push('updated_at = NOW()');
  params.push(contactId);

  const result = await query(
    `UPDATE crm_contacts SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params,
  );
  if (!result.rows[0]) throw new Error('Contact not found');

  eventBus.emit('crm.contact.updated', { contactId, updatedBy: ctx.userId });

  return result.rows[0] as Contact;
}

export async function deleteContact(contactId: string): Promise<void> {
  await query('DELETE FROM crm_contacts WHERE id = $1', [contactId]);
}

export async function searchContacts(
  ctx: CallerContext,
  searchQuery: string,
): Promise<Contact[]> {
  const conditions = [`(ct.first_name ILIKE $1 OR ct.last_name ILIKE $1 OR ct.email ILIKE $1 OR co.name ILIKE $1)`];
  const params: unknown[] = [`%${searchQuery}%`];
  let idx = 2;

  if (ctx.organizationId) {
    conditions.push(`ct.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }

  const result = await query(
    `SELECT ct.*, co.name as company_name, u.full_name as owner_name
     FROM crm_contacts ct
     LEFT JOIN crm_companies co ON co.id = ct.company_id
     LEFT JOIN reimbursement_users u ON u.id = ct.owner_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ct.first_name
     LIMIT 20`,
    params,
  );
  return result.rows as Contact[];
}

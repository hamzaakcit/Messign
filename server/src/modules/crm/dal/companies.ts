import { query } from '../../../db/index.js';
import { eventBus } from '../../../events/index.js';
import type { CallerContext, PaginatedResult, SortOptions } from '../../../dal/types.js';
import { paginationClause } from '../../../dal/helpers.js';

// ── Interfaces ──

export interface Company {
  id: string;
  organization_id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  annual_revenue: number | null;
  address: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  vendor_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deal_count?: number;
  total_deal_value?: number;
  contacts?: unknown[];
  deals?: unknown[];
}

export interface CreateCompanyInput {
  name: string;
  domain?: string;
  industry?: string;
  size?: string;
  annual_revenue?: number;
  address?: string;
  city?: string;
  country?: string;
  notes?: string;
  vendor_id?: string;
}

export interface CompanyFilters {
  industry?: string;
  size?: string;
  search?: string;
}

// ── Functions ──

export async function listCompanies(
  ctx: CallerContext,
  filters?: CompanyFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Company>> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (ctx.organizationId) {
    conditions.push(`c.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }
  if (filters?.industry) {
    conditions.push(`c.industry = $${idx++}`);
    params.push(filters.industry);
  }
  if (filters?.size) {
    conditions.push(`c.size = $${idx++}`);
    params.push(filters.size);
  }
  if (filters?.search) {
    conditions.push(`(c.name ILIKE $${idx} OR c.domain ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  const whereSQL = conditions.length > 0 ? conditions.join(' AND ') : '1=1';

  const sortCol: Record<string, string> = {
    name: 'c.name', created: 'c.created_at', revenue: 'c.annual_revenue',
  };
  const orderBy = sortCol[sort?.field ?? 'name'] ?? 'c.name';
  const orderDir = sort?.direction === 'desc' ? 'DESC' : 'ASC';

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM crm_companies c WHERE ${whereSQL}`,
    params,
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const pg = paginationClause(page, pageSize, idx);
  const dataResult = await query(
    `SELECT c.*,
            COUNT(DISTINCT d.id)::int as deal_count,
            COALESCE(SUM(d.amount), 0)::numeric as total_deal_value
     FROM crm_companies c
     LEFT JOIN crm_deals d ON d.company_id = c.id
     WHERE ${whereSQL}
     GROUP BY c.id
     ORDER BY ${orderBy} ${orderDir}
     ${pg.clause}`,
    [...params, ...pg.params],
  );

  return { data: dataResult.rows as Company[], total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function getCompanyById(ctx: CallerContext, companyId: string): Promise<Company | null> {
  const conditions = ['c.id = $1'];
  const params: unknown[] = [companyId];
  let idx = 2;

  if (ctx.organizationId) {
    conditions.push(`c.organization_id = $${idx++}`);
    params.push(ctx.organizationId);
  }

  const result = await query(
    `SELECT c.*,
            COUNT(DISTINCT d.id)::int as deal_count,
            COALESCE(SUM(d.amount), 0)::numeric as total_deal_value
     FROM crm_companies c
     LEFT JOIN crm_deals d ON d.company_id = c.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY c.id`,
    params,
  );
  if (!result.rows[0]) return null;

  const [contactsResult, dealsResult] = await Promise.all([
    query(
      `SELECT ct.id, ct.first_name, ct.last_name, ct.email, ct.job_title
       FROM crm_contacts ct
       WHERE ct.company_id = $1
       ORDER BY ct.first_name`,
      [companyId],
    ),
    query(
      `SELECT d.id, d.title, d.amount, d.currency, s.name as stage_name, s.is_won, s.is_lost
       FROM crm_deals d
       JOIN crm_deal_stages s ON s.id = d.stage_id
       WHERE d.company_id = $1
       ORDER BY d.created_at DESC`,
      [companyId],
    ),
  ]);

  return {
    ...result.rows[0],
    contacts: contactsResult.rows,
    deals: dealsResult.rows,
  } as Company;
}

export async function createCompany(ctx: CallerContext, data: CreateCompanyInput): Promise<Company> {
  let vendorId = data.vendor_id ?? null;

  if (!vendorId && data.domain && ctx.organizationId) {
    const vendorMatch = await query<{ id: string }>(
      `SELECT id FROM finance_vendors
       WHERE organization_id = $1 AND website ILIKE '%' || $2 || '%' AND is_active = true
       LIMIT 1`,
      [ctx.organizationId, data.domain],
    );
    if (vendorMatch.rows[0]) {
      vendorId = vendorMatch.rows[0].id;
    }
  }

  const result = await query(
    `INSERT INTO crm_companies
     (organization_id, name, domain, industry, size, annual_revenue, address, city, country, notes, vendor_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      ctx.organizationId ?? null, data.name, data.domain ?? null, data.industry ?? null,
      data.size ?? null, data.annual_revenue ?? null, data.address ?? null, data.city ?? null,
      data.country ?? null, data.notes ?? null, vendorId, ctx.userId,
    ],
  );
  const company = result.rows[0] as Company;

  eventBus.emit('crm.company.created', {
    companyId: company.id, name: company.name, createdBy: ctx.userId,
  });

  return company;
}

export async function updateCompany(
  ctx: CallerContext,
  companyId: string,
  data: Partial<CreateCompanyInput>,
): Promise<Company> {
  const fields: [string, unknown][] = [
    ['name', data.name], ['domain', data.domain], ['industry', data.industry],
    ['size', data.size], ['annual_revenue', data.annual_revenue], ['address', data.address],
    ['city', data.city], ['country', data.country], ['notes', data.notes], ['vendor_id', data.vendor_id],
  ];
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
  params.push(companyId);

  const result = await query(
    `UPDATE crm_companies SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params,
  );
  if (!result.rows[0]) throw new Error('Company not found');
  return result.rows[0] as Company;
}

export async function deleteCompany(companyId: string): Promise<void> {
  await query('DELETE FROM crm_companies WHERE id = $1', [companyId]);
}

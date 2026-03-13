import type { PoolClient } from 'pg';
import { withTenantQuery } from '../../middleware/tenantContext.js';
import { eventBus } from '../../events/index.js';
import type { CallerContext, PaginatedResult, SortOptions } from '../types.js';
import { paginationClause } from '../helpers.js';
import { ANALYTICS_VIEWS, refreshMaterializedViews } from '../../services/analytics/materializedViews.js';

async function runInTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantQuery(tenantId, fn);
}

export interface License {
  id: string;
  organization_id: string | null;
  software_name: string;
  vendor: string | null;
  vendor_id: string | null;
  license_type: string;
  seats_purchased: number;
  seats_used: number;
  cost_per_seat: number | null;
  total_monthly_cost: number | null;
  currency: string;
  billing_cycle: string;
  start_date: string | null;
  expiry_date: string | null;
  auto_renew: boolean;
  renewal_cost: number | null;
  admin_url: string | null;
  notes: string | null;
  tags: string[];
  status: string;
  created_at: string;
  updated_at: string;
  seats?: LicenseSeat[];
}

export interface LicenseSeat {
  id: string;
  license_id: string;
  user_id: string;
  assigned_at: string;
  last_active_at: string | null;
  user_name?: string | null;
}

export interface LicenseFilters {
  status?: string;
  underutilized?: boolean;
  expiringWithin?: number;
  search?: string;
}

export interface CreateLicenseInput {
  software_name: string;
  vendor?: string;
  vendor_id?: string;
  license_type?: string;
  seats_purchased?: number;
  seats_used?: number;
  cost_per_seat?: number;
  total_monthly_cost?: number;
  currency?: string;
  billing_cycle?: string;
  start_date?: string;
  expiry_date?: string;
  auto_renew?: boolean;
  renewal_cost?: number;
  admin_url?: string;
  notes?: string;
  tags?: string[];
  status?: string;
}

export type UpdateLicenseInput = Partial<CreateLicenseInput>;

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function mapLicense(row: Record<string, unknown>): License {
  return {
    id: String(row.id),
    organization_id: row.organization_id ? String(row.organization_id) : null,
    software_name: String(row.software_name ?? ''),
    vendor: row.vendor ? String(row.vendor) : null,
    vendor_id: row.vendor_id ? String(row.vendor_id) : null,
    license_type: String(row.license_type ?? 'subscription'),
    seats_purchased: toNum(row.seats_purchased),
    seats_used: toNum(row.seats_used),
    cost_per_seat: row.cost_per_seat == null ? null : toNum(row.cost_per_seat),
    total_monthly_cost: row.total_monthly_cost == null ? null : toNum(row.total_monthly_cost),
    currency: String(row.currency ?? 'EUR'),
    billing_cycle: String(row.billing_cycle ?? 'monthly'),
    start_date: row.start_date ? String(row.start_date) : null,
    expiry_date: row.expiry_date ? String(row.expiry_date) : null,
    auto_renew: Boolean(row.auto_renew),
    renewal_cost: row.renewal_cost == null ? null : toNum(row.renewal_cost),
    admin_url: row.admin_url ? String(row.admin_url) : null,
    notes: row.notes ? String(row.notes) : null,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    status: String(row.status ?? 'active'),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listLicenses(
  ctx: CallerContext,
  filters?: LicenseFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<License>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for listLicenses');

  const conditions = ['1=1'];
  const params: unknown[] = [];
  let idx = 1;
  if (filters?.status) {
    conditions.push(`l.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.expiringWithin != null) {
    conditions.push(`l.expiry_date <= CURRENT_DATE + ($${idx++} || ' days')::interval`);
    params.push(filters.expiringWithin);
  }
  if (filters?.underutilized) {
    conditions.push(`l.seats_purchased > 0 AND l.seats_used::numeric / l.seats_purchased < 0.5`);
  }
  if (filters?.search) {
    conditions.push(`(l.software_name ILIKE $${idx} OR COALESCE(l.vendor, '') ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }
  const where = conditions.join(' AND ');
  return runInTenant(tenantId, async (client) => {
    const count = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM licenses l WHERE ${where}`, params);
    const total = Number(count.rows[0]?.count ?? 0);
    const pg = paginationClause(page, pageSize, idx);
    const orderMap: Record<string, string> = {
      software_name: 'l.software_name',
      seats_used: 'l.seats_used',
      seats_purchased: 'l.seats_purchased',
      expiry_date: 'l.expiry_date',
      total_monthly_cost: 'l.total_monthly_cost',
      created_at: 'l.created_at',
    };
    const orderBy = orderMap[sort?.field ?? 'created_at'] ?? 'l.created_at';
    const dir = sort?.direction === 'asc' ? 'ASC' : 'DESC';
    const rows = await client.query<Record<string, unknown>>(
      `SELECT l.* FROM licenses l WHERE ${where} ORDER BY ${orderBy} ${dir} ${pg.clause}`,
      [...params, ...pg.params],
    );
    return { data: rows.rows.map(mapLicense), total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
  });
}

export async function getLicenseById(ctx: CallerContext, licenseId: string): Promise<License | null> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getLicenseById');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `SELECT * FROM licenses
       WHERE id = $1::uuid
       LIMIT 1`,
      [licenseId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const license = mapLicense(row);
    const seats = await client.query<Record<string, unknown>>(
      `SELECT ls.*, ru.full_name AS user_name
       FROM license_seats ls
       LEFT JOIN reimbursement_users ru ON ru.id = ls.user_id
       WHERE ls.license_id = $1::uuid
       ORDER BY ls.assigned_at DESC`,
      [licenseId],
    );
    license.seats = seats.rows.map((s) => ({
    id: String(s.id),
    license_id: String(s.license_id),
    user_id: String(s.user_id),
    assigned_at: String(s.assigned_at),
    last_active_at: s.last_active_at ? String(s.last_active_at) : null,
    user_name: s.user_name ? String(s.user_name) : null,
  }));
    return license;
  });
}

export async function createLicense(ctx: CallerContext, data: CreateLicenseInput): Promise<License> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Organization context required');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<Record<string, unknown>>(
    `INSERT INTO licenses (
       organization_id, software_name, vendor, vendor_id, license_type, seats_purchased, seats_used,
       cost_per_seat, total_monthly_cost, currency, billing_cycle, start_date, expiry_date, auto_renew,
       renewal_cost, admin_url, notes, tags, status
     ) VALUES (
       $1::uuid, $2, $3, $4::uuid, COALESCE($5, 'subscription'), COALESCE($6, 0), COALESCE($7, 0),
       $8, $9, COALESCE($10, 'EUR'), COALESCE($11, 'monthly'), $12::date, $13::date, COALESCE($14, FALSE),
       $15, $16, $17, COALESCE($18::jsonb, '[]'::jsonb), COALESCE($19, 'active')
     ) RETURNING *`,
      [
        tenantId,
      data.software_name,
      data.vendor ?? null,
      data.vendor_id ?? null,
      data.license_type ?? null,
      data.seats_purchased ?? 0,
      data.seats_used ?? 0,
      data.cost_per_seat ?? null,
      data.total_monthly_cost ?? null,
      data.currency ?? 'EUR',
      data.billing_cycle ?? 'monthly',
      data.start_date ?? null,
      data.expiry_date ?? null,
      data.auto_renew ?? false,
      data.renewal_cost ?? null,
      data.admin_url ?? null,
      data.notes ?? null,
      data.tags ? JSON.stringify(data.tags) : null,
      data.status ?? 'active',
      ],
    );
    await refreshMaterializedViews([ANALYTICS_VIEWS.licenseUtilization]);
    return mapLicense(result.rows[0]);
  });
}

export async function updateLicense(ctx: CallerContext, licenseId: string, data: UpdateLicenseInput): Promise<License> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for updateLicense');

  const existing = await getLicenseById(ctx, licenseId);
  if (!existing) throw new Error('License not found');
  const fields: Array<[string, unknown, string?]> = [
    ['software_name', data.software_name],
    ['vendor', data.vendor],
    ['vendor_id', data.vendor_id, '::uuid'],
    ['license_type', data.license_type],
    ['seats_purchased', data.seats_purchased],
    ['seats_used', data.seats_used],
    ['cost_per_seat', data.cost_per_seat],
    ['total_monthly_cost', data.total_monthly_cost],
    ['currency', data.currency],
    ['billing_cycle', data.billing_cycle],
    ['start_date', data.start_date, '::date'],
    ['expiry_date', data.expiry_date, '::date'],
    ['auto_renew', data.auto_renew],
    ['renewal_cost', data.renewal_cost],
    ['admin_url', data.admin_url],
    ['notes', data.notes],
    ['tags', data.tags ? JSON.stringify(data.tags) : undefined, '::jsonb'],
    ['status', data.status],
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
  params.push(licenseId);
  const result = await runInTenant(tenantId, async (client) => {
    return client.query<Record<string, unknown>>(
      `UPDATE licenses SET ${sets.join(', ')}
       WHERE id = $${idx}::uuid
       RETURNING *`,
      params,
    );
  });
  await refreshMaterializedViews([ANALYTICS_VIEWS.licenseUtilization]);
  return mapLicense(result.rows[0]);
}

export async function assignSeat(ctx: CallerContext, licenseId: string, userId: string): Promise<LicenseSeat> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for assignSeat');

  const license = await getLicenseById(ctx, licenseId);
  if (!license) throw new Error('License not found');

  const inserted = await runInTenant(tenantId, async (client) => {
    const ins = await client.query<Record<string, unknown>>(
      `INSERT INTO license_seats (license_id, user_id)
       VALUES ($1::uuid, $2::uuid)
       ON CONFLICT (license_id, user_id) DO UPDATE SET last_active_at = COALESCE(license_seats.last_active_at, NOW())
       RETURNING *`,
      [licenseId, userId],
    );
    await client.query(`UPDATE licenses SET seats_used = (SELECT COUNT(*) FROM license_seats WHERE license_id = $1::uuid), updated_at = NOW() WHERE id = $1::uuid`, [licenseId]);
    return ins;
  });
  const refreshed = await getLicenseById(ctx, licenseId);
  if (refreshed && refreshed.seats_purchased > 0) {
    const utilization = (refreshed.seats_used / refreshed.seats_purchased) * 100;
    if (utilization < 50) {
      eventBus.emit('asset.license.underutilized', {
        licenseId: refreshed.id,
        softwareName: refreshed.software_name,
        utilizationPercent: Number(utilization.toFixed(1)),
        seatsUsed: refreshed.seats_used,
        seatsPurchased: refreshed.seats_purchased,
        monthlyCost: refreshed.total_monthly_cost ?? 0,
      });
    }
  }
  await refreshMaterializedViews([ANALYTICS_VIEWS.licenseUtilization]);
  const seat = inserted.rows[0];
  return {
    id: String(seat.id),
    license_id: String(seat.license_id),
    user_id: String(seat.user_id),
    assigned_at: String(seat.assigned_at),
    last_active_at: seat.last_active_at ? String(seat.last_active_at) : null,
  };
}

export async function removeSeat(ctx: CallerContext, licenseId: string, userId: string): Promise<void> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for removeSeat');

  await runInTenant(tenantId, async (client) => {
    await client.query(`DELETE FROM license_seats WHERE license_id = $1::uuid AND user_id = $2::uuid`, [licenseId, userId]);
    await client.query(`UPDATE licenses SET seats_used = (SELECT COUNT(*) FROM license_seats WHERE license_id = $1::uuid), updated_at = NOW() WHERE id = $1::uuid`, [licenseId]);
  });
  await refreshMaterializedViews([ANALYTICS_VIEWS.licenseUtilization]);
}

export async function getLicenseUtilization(ctx: CallerContext): Promise<Array<Record<string, unknown>>> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getLicenseUtilization');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `SELECT * FROM mv_license_utilization
       WHERE license_id IN (SELECT id FROM licenses)
       ORDER BY utilization_percent ASC, software_name ASC`,
    );
    return result.rows;
  });
}

export async function getUnderutilizedLicenses(ctx: CallerContext): Promise<License[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getUnderutilizedLicenses');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `SELECT l.*
       FROM licenses l
       WHERE l.seats_purchased > 0
         AND l.seats_used::numeric / l.seats_purchased < 0.5
       ORDER BY l.total_monthly_cost DESC NULLS LAST`,
    );
    return result.rows.map(mapLicense);
  });
}

export async function getExpiringLicenses(ctx: CallerContext, withinDays: number = 30): Promise<License[]> {
  const tenantId = ctx.organizationId;
  if (!tenantId) throw new Error('Tenant context required for getExpiringLicenses');

  return runInTenant(tenantId, async (client) => {
    const result = await client.query<Record<string, unknown>>(
      `SELECT * FROM licenses
       WHERE expiry_date IS NOT NULL
         AND expiry_date <= CURRENT_DATE + ($1 || ' days')::interval
       ORDER BY expiry_date ASC`,
      [withinDays],
    );
    return result.rows.map(mapLicense);
  });
}

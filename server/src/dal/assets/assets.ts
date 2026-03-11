import { query } from '../../db/index.js';
import { eventBus } from '../../events/index.js';
import type { CallerContext, PaginatedResult, SortOptions } from '../types.js';
import { paginationClause } from '../helpers.js';
import { ANALYTICS_VIEWS, refreshMaterializedViews } from '../../services/analytics/materializedViews.js';

export interface Asset {
  id: string;
  organization_id: string | null;
  category_id: string | null;
  name: string;
  description: string | null;
  asset_tag: string | null;
  serial_number: string | null;
  manufacturer: string | null;
  model: string | null;
  status: string;
  condition: string;
  purchase_cost: number | null;
  purchase_currency: string;
  purchase_cost_eur: number | null;
  purchase_date: string | null;
  current_value: number | null;
  salvage_value: number | null;
  assigned_to: string | null;
  assigned_at: string | null;
  department: string | null;
  location: string | null;
  warranty_start: string | null;
  warranty_end: string | null;
  warranty_provider: string | null;
  warranty_notes: string | null;
  vendor_id: string | null;
  purchase_invoice_id: string | null;
  specifications: Record<string, unknown>;
  tags: string[];
  notes: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  category_name?: string | null;
  assigned_to_name?: string | null;
  assignments?: AssetAssignment[];
  maintenance?: AssetMaintenance[];
}

export interface AssetAssignment {
  id: string;
  asset_id: string;
  assigned_to: string;
  assigned_by: string | null;
  assigned_at: string;
  returned_at: string | null;
  return_condition: string | null;
  return_notes: string | null;
  assigned_to_name?: string | null;
  assigned_by_name?: string | null;
}

export interface AssetMaintenance {
  id: string;
  asset_id: string;
  type: string | null;
  description: string | null;
  cost: number | null;
  performed_by: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface AssetFilters {
  status?: string;
  categoryId?: string;
  assignedTo?: string;
  departmentId?: string;
  warrantyExpiring?: boolean;
  search?: string;
}

export interface CreateAssetInput {
  category_id?: string;
  name: string;
  description?: string;
  asset_tag?: string;
  serial_number?: string;
  manufacturer?: string;
  model?: string;
  status?: string;
  condition?: string;
  purchase_cost?: number;
  purchase_currency?: string;
  purchase_cost_eur?: number;
  purchase_date?: string;
  current_value?: number;
  salvage_value?: number;
  department?: string;
  location?: string;
  warranty_start?: string;
  warranty_end?: string;
  warranty_provider?: string;
  warranty_notes?: string;
  vendor_id?: string;
  purchase_invoice_id?: string;
  specifications?: Record<string, unknown>;
  tags?: string[];
  notes?: string;
  image_url?: string;
}

export type UpdateAssetInput = Partial<CreateAssetInput>;

export interface MaintenanceInput {
  type?: string;
  description?: string;
  cost?: number;
  performed_by?: string;
  scheduled_date: string;
  notes?: string;
}

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function mapAsset(row: Record<string, unknown>): Asset {
  return {
    id: String(row.id),
    organization_id: row.organization_id ? String(row.organization_id) : null,
    category_id: row.category_id ? String(row.category_id) : null,
    name: String(row.name ?? ''),
    description: row.description ? String(row.description) : null,
    asset_tag: row.asset_tag ? String(row.asset_tag) : null,
    serial_number: row.serial_number ? String(row.serial_number) : null,
    manufacturer: row.manufacturer ? String(row.manufacturer) : null,
    model: row.model ? String(row.model) : null,
    status: String(row.status ?? 'available'),
    condition: String(row.condition ?? 'good'),
    purchase_cost: row.purchase_cost == null ? null : toNum(row.purchase_cost),
    purchase_currency: String(row.purchase_currency ?? 'EUR'),
    purchase_cost_eur: row.purchase_cost_eur == null ? null : toNum(row.purchase_cost_eur),
    purchase_date: row.purchase_date ? String(row.purchase_date) : null,
    current_value: row.current_value == null ? null : toNum(row.current_value),
    salvage_value: row.salvage_value == null ? null : toNum(row.salvage_value),
    assigned_to: row.assigned_to ? String(row.assigned_to) : null,
    assigned_at: row.assigned_at ? String(row.assigned_at) : null,
    department: row.department ? String(row.department) : null,
    location: row.location ? String(row.location) : null,
    warranty_start: row.warranty_start ? String(row.warranty_start) : null,
    warranty_end: row.warranty_end ? String(row.warranty_end) : null,
    warranty_provider: row.warranty_provider ? String(row.warranty_provider) : null,
    warranty_notes: row.warranty_notes ? String(row.warranty_notes) : null,
    vendor_id: row.vendor_id ? String(row.vendor_id) : null,
    purchase_invoice_id: row.purchase_invoice_id ? String(row.purchase_invoice_id) : null,
    specifications: row.specifications && typeof row.specifications === 'object' ? row.specifications as Record<string, unknown> : {},
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    notes: row.notes ? String(row.notes) : null,
    image_url: row.image_url ? String(row.image_url) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    category_name: row.category_name ? String(row.category_name) : null,
    assigned_to_name: row.assigned_to_name ? String(row.assigned_to_name) : null,
  };
}

export async function listAssets(
  ctx: CallerContext,
  filters?: AssetFilters,
  sort?: SortOptions,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<Asset>> {
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let idx = 1;

  if (ctx.organizationId) {
    conditions.push(`a.organization_id = $${idx++}::uuid`);
    params.push(ctx.organizationId);
  }
  if (filters?.status) {
    conditions.push(`a.status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.categoryId) {
    conditions.push(`a.category_id = $${idx++}::uuid`);
    params.push(filters.categoryId);
  }
  if (filters?.assignedTo) {
    conditions.push(`a.assigned_to = $${idx++}::uuid`);
    params.push(filters.assignedTo);
  }
  if (filters?.departmentId) {
    conditions.push(`a.department = $${idx++}`);
    params.push(filters.departmentId);
  }
  if (filters?.warrantyExpiring) {
    conditions.push(`a.warranty_end IS NOT NULL AND a.warranty_end <= CURRENT_DATE + INTERVAL '30 days'`);
  }
  if (filters?.search) {
    conditions.push(`(a.name ILIKE $${idx} OR a.asset_tag ILIKE $${idx} OR a.serial_number ILIKE $${idx} OR a.manufacturer ILIKE $${idx} OR a.model ILIKE $${idx})`);
    params.push(`%${filters.search}%`);
    idx++;
  }

  const where = conditions.join(' AND ');
  const countRes = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM assets a WHERE ${where}`, params);
  const total = Number(countRes.rows[0]?.count ?? 0);
  const pg = paginationClause(page, pageSize, idx);
  const orderByMap: Record<string, string> = {
    name: 'a.name',
    status: 'a.status',
    created_at: 'a.created_at',
    warranty_end: 'a.warranty_end',
    purchase_cost: 'a.purchase_cost',
    current_value: 'a.current_value',
  };
  const orderBy = orderByMap[sort?.field ?? 'created_at'] ?? 'a.created_at';
  const direction = sort?.direction === 'asc' ? 'ASC' : 'DESC';

  const rows = await query<Record<string, unknown>>(
    `SELECT a.*, ac.name AS category_name, ru.full_name AS assigned_to_name
     FROM assets a
     LEFT JOIN asset_categories ac ON ac.id = a.category_id
     LEFT JOIN reimbursement_users ru ON ru.id = a.assigned_to
     WHERE ${where}
     ORDER BY ${orderBy} ${direction}
     ${pg.clause}`,
    [...params, ...pg.params],
  );

  return {
    data: rows.rows.map(mapAsset),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

export async function getAssetById(ctx: CallerContext, assetId: string): Promise<Asset | null> {
  const result = await query<Record<string, unknown>>(
    `SELECT a.*, ac.name AS category_name, ru.full_name AS assigned_to_name
     FROM assets a
     LEFT JOIN asset_categories ac ON ac.id = a.category_id
     LEFT JOIN reimbursement_users ru ON ru.id = a.assigned_to
     WHERE a.id = $1::uuid
       AND ($2::uuid IS NULL OR a.organization_id = $2::uuid)
     LIMIT 1`,
    [assetId, ctx.organizationId ?? null],
  );
  const row = result.rows[0];
  if (!row) return null;
  const asset = mapAsset(row);
  const [assignments, maintenance] = await Promise.all([
    query<Record<string, unknown>>(
      `SELECT aa.*, u1.full_name AS assigned_to_name, u2.full_name AS assigned_by_name
       FROM asset_assignments aa
       LEFT JOIN reimbursement_users u1 ON u1.id = aa.assigned_to
       LEFT JOIN reimbursement_users u2 ON u2.id = aa.assigned_by
       WHERE aa.asset_id = $1::uuid
       ORDER BY aa.assigned_at DESC`,
      [assetId],
    ),
    query<Record<string, unknown>>(
      `SELECT * FROM asset_maintenance WHERE asset_id = $1::uuid ORDER BY created_at DESC`,
      [assetId],
    ),
  ]);
  asset.assignments = assignments.rows.map((r) => ({
    id: String(r.id),
    asset_id: String(r.asset_id),
    assigned_to: String(r.assigned_to),
    assigned_by: r.assigned_by ? String(r.assigned_by) : null,
    assigned_at: String(r.assigned_at),
    returned_at: r.returned_at ? String(r.returned_at) : null,
    return_condition: r.return_condition ? String(r.return_condition) : null,
    return_notes: r.return_notes ? String(r.return_notes) : null,
    assigned_to_name: r.assigned_to_name ? String(r.assigned_to_name) : null,
    assigned_by_name: r.assigned_by_name ? String(r.assigned_by_name) : null,
  }));
  asset.maintenance = maintenance.rows.map((r) => ({
    id: String(r.id),
    asset_id: String(r.asset_id),
    type: r.type ? String(r.type) : null,
    description: r.description ? String(r.description) : null,
    cost: r.cost == null ? null : toNum(r.cost),
    performed_by: r.performed_by ? String(r.performed_by) : null,
    scheduled_date: r.scheduled_date ? String(r.scheduled_date) : null,
    completed_date: r.completed_date ? String(r.completed_date) : null,
    status: String(r.status ?? 'scheduled'),
    notes: r.notes ? String(r.notes) : null,
    created_at: String(r.created_at),
  }));
  return asset;
}

export async function createAsset(ctx: CallerContext, data: CreateAssetInput): Promise<Asset> {
  if (!ctx.organizationId) throw new Error('Organization context required');
  const result = await query<Record<string, unknown>>(
    `INSERT INTO assets (
       organization_id, category_id, name, description, asset_tag, serial_number, manufacturer, model,
       status, condition, purchase_cost, purchase_currency, purchase_cost_eur, purchase_date, current_value, salvage_value,
       department, location, warranty_start, warranty_end, warranty_provider, warranty_notes,
       vendor_id, purchase_invoice_id, specifications, tags, notes, image_url
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8,
       COALESCE($9, 'available'), COALESCE($10, 'good'), $11, COALESCE($12, 'EUR'), $13, $14::date, $15, COALESCE($16, 0),
       $17, $18, $19::date, $20::date, $21, $22,
       $23::uuid, $24::uuid, COALESCE($25::jsonb, '{}'::jsonb), COALESCE($26::jsonb, '[]'::jsonb), $27, $28
     ) RETURNING *`,
    [
      ctx.organizationId,
      data.category_id ?? null,
      data.name,
      data.description ?? null,
      data.asset_tag ?? null,
      data.serial_number ?? null,
      data.manufacturer ?? null,
      data.model ?? null,
      data.status ?? null,
      data.condition ?? null,
      data.purchase_cost ?? null,
      data.purchase_currency ?? 'EUR',
      data.purchase_cost_eur ?? data.purchase_cost ?? null,
      data.purchase_date ?? null,
      data.current_value ?? data.purchase_cost_eur ?? data.purchase_cost ?? null,
      data.salvage_value ?? 0,
      data.department ?? null,
      data.location ?? null,
      data.warranty_start ?? null,
      data.warranty_end ?? null,
      data.warranty_provider ?? null,
      data.warranty_notes ?? null,
      data.vendor_id ?? null,
      data.purchase_invoice_id ?? null,
      data.specifications ? JSON.stringify(data.specifications) : null,
      data.tags ? JSON.stringify(data.tags) : null,
      data.notes ?? null,
      data.image_url ?? null,
    ],
  );
  const asset = mapAsset(result.rows[0]);
  eventBus.emit('asset.created', {
    assetId: asset.id,
    name: asset.name,
    type: asset.category_name ?? 'asset',
    purchaseCost: asset.purchase_cost ?? 0,
    currency: asset.purchase_currency,
  });
  await refreshMaterializedViews([ANALYTICS_VIEWS.assetSummary]);
  return asset;
}

export async function updateAsset(ctx: CallerContext, assetId: string, data: UpdateAssetInput): Promise<Asset> {
  const existing = await getAssetById(ctx, assetId);
  if (!existing) throw new Error('Asset not found');
  const fields: Array<[string, unknown]> = [
    ['category_id', data.category_id],
    ['name', data.name],
    ['description', data.description],
    ['asset_tag', data.asset_tag],
    ['serial_number', data.serial_number],
    ['manufacturer', data.manufacturer],
    ['model', data.model],
    ['status', data.status],
    ['condition', data.condition],
    ['purchase_cost', data.purchase_cost],
    ['purchase_currency', data.purchase_currency],
    ['purchase_cost_eur', data.purchase_cost_eur],
    ['purchase_date', data.purchase_date],
    ['current_value', data.current_value],
    ['salvage_value', data.salvage_value],
    ['department', data.department],
    ['location', data.location],
    ['warranty_start', data.warranty_start],
    ['warranty_end', data.warranty_end],
    ['warranty_provider', data.warranty_provider],
    ['warranty_notes', data.warranty_notes],
    ['vendor_id', data.vendor_id],
    ['purchase_invoice_id', data.purchase_invoice_id],
    ['specifications', data.specifications ? JSON.stringify(data.specifications) : undefined],
    ['tags', data.tags ? JSON.stringify(data.tags) : undefined],
    ['notes', data.notes],
    ['image_url', data.image_url],
  ];
  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  for (const [col, val] of fields) {
    if (val !== undefined) {
      sets.push(`${col} = $${idx++}${col === 'category_id' || col === 'vendor_id' || col === 'purchase_invoice_id' ? '::uuid' : col === 'purchase_date' || col === 'warranty_start' || col === 'warranty_end' ? '::date' : col === 'specifications' || col === 'tags' ? '::jsonb' : ''}`);
      params.push(val ?? null);
    }
  }
  sets.push('updated_at = NOW()');
  params.push(assetId, ctx.organizationId ?? null);
  const result = await query<Record<string, unknown>>(
    `UPDATE assets SET ${sets.join(', ')}
     WHERE id = $${idx++}::uuid
       AND ($${idx}::uuid IS NULL OR organization_id = $${idx}::uuid)
     RETURNING *`,
    params,
  );
  if (!result.rows[0]) throw new Error('Asset not found');
  await refreshMaterializedViews([ANALYTICS_VIEWS.assetSummary]);
  return mapAsset(result.rows[0]);
}

export async function assignAsset(ctx: CallerContext, assetId: string, assigneeId: string): Promise<Asset> {
  const asset = await getAssetById(ctx, assetId);
  if (!asset) throw new Error('Asset not found');
  await query(
    `INSERT INTO asset_assignments (asset_id, assigned_to, assigned_by) VALUES ($1::uuid, $2::uuid, $3::uuid)`,
    [assetId, assigneeId, ctx.userId],
  );
  const updated = await query<Record<string, unknown>>(
    `UPDATE assets
     SET assigned_to = $2::uuid, assigned_at = NOW(), status = 'assigned', updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING *`,
    [assetId, assigneeId],
  );
  const mapped = mapAsset(updated.rows[0]);
  eventBus.emit('asset.assigned', {
    assetId: mapped.id,
    assigneeId,
    assignedBy: ctx.userId,
    assetName: mapped.name,
  });
  await refreshMaterializedViews([ANALYTICS_VIEWS.assetSummary]);
  return mapped;
}

export async function returnAsset(ctx: CallerContext, assetId: string, condition: string, notes?: string): Promise<Asset> {
  const asset = await getAssetById(ctx, assetId);
  if (!asset) throw new Error('Asset not found');
  if (!asset.assigned_to) throw new Error('Asset is not currently assigned');
  await query(
    `UPDATE asset_assignments
     SET returned_at = NOW(), return_condition = $2, return_notes = $3
     WHERE id = (
       SELECT id FROM asset_assignments
       WHERE asset_id = $1::uuid AND returned_at IS NULL
       ORDER BY assigned_at DESC
       LIMIT 1
     )`,
    [assetId, condition, notes ?? null],
  );
  const updated = await query<Record<string, unknown>>(
    `UPDATE assets
     SET assigned_to = NULL, assigned_at = NULL, status = 'available', condition = COALESCE($2, condition), updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING *`,
    [assetId, condition],
  );
  const mapped = mapAsset(updated.rows[0]);
  eventBus.emit('asset.returned', {
    assetId: mapped.id,
    returnedBy: ctx.userId,
    previousAssigneeId: asset.assigned_to,
    condition,
  });
  await refreshMaterializedViews([ANALYTICS_VIEWS.assetSummary]);
  return mapped;
}

export async function retireAsset(ctx: CallerContext, assetId: string, reason: string): Promise<Asset> {
  const asset = await getAssetById(ctx, assetId);
  if (!asset) throw new Error('Asset not found');
  const result = await query<Record<string, unknown>>(
    `UPDATE assets SET status = 'retired', notes = COALESCE(notes, '') || $2, updated_at = NOW() WHERE id = $1::uuid RETURNING *`,
    [assetId, `\n[Retired by ${ctx.userId}] ${reason}`],
  );
  const mapped = mapAsset(result.rows[0]);
  eventBus.emit('asset.retired', {
    assetId: mapped.id,
    reason,
    retiredBy: ctx.userId,
    originalCost: mapped.purchase_cost ?? 0,
  });
  await refreshMaterializedViews([ANALYTICS_VIEWS.assetSummary]);
  return mapped;
}

export async function scheduleMaintenance(ctx: CallerContext, assetId: string, data: MaintenanceInput): Promise<AssetMaintenance> {
  const asset = await getAssetById(ctx, assetId);
  if (!asset) throw new Error('Asset not found');
  const result = await query<Record<string, unknown>>(
    `INSERT INTO asset_maintenance (asset_id, type, description, cost, performed_by, scheduled_date, notes)
     VALUES ($1::uuid, $2, $3, $4, $5, $6::date, $7)
     RETURNING *`,
    [
      assetId,
      data.type ?? null,
      data.description ?? null,
      data.cost ?? null,
      data.performed_by ?? null,
      data.scheduled_date,
      data.notes ?? null,
    ],
  );
  await query(`UPDATE assets SET status = 'in_maintenance', updated_at = NOW() WHERE id = $1::uuid`, [assetId]);
  eventBus.emit('asset.maintenance_scheduled', {
    assetId,
    maintenanceType: data.type ?? 'inspection',
    scheduledDate: data.scheduled_date,
  });
  await refreshMaterializedViews([ANALYTICS_VIEWS.assetSummary]);
  const row = result.rows[0];
  return {
    id: String(row.id),
    asset_id: String(row.asset_id),
    type: row.type ? String(row.type) : null,
    description: row.description ? String(row.description) : null,
    cost: row.cost == null ? null : toNum(row.cost),
    performed_by: row.performed_by ? String(row.performed_by) : null,
    scheduled_date: row.scheduled_date ? String(row.scheduled_date) : null,
    completed_date: row.completed_date ? String(row.completed_date) : null,
    status: String(row.status ?? 'scheduled'),
    notes: row.notes ? String(row.notes) : null,
    created_at: String(row.created_at),
  };
}

export async function getAssetMetrics(ctx: CallerContext): Promise<{
  totalAssets: number;
  totalValue: number;
  assigned: number;
  available: number;
  warrantyExpiring: number;
  depreciationThisMonth: number;
}> {
  const summary = await query<Record<string, unknown>>(
    `SELECT
       COUNT(*)::int AS total_assets,
       COALESCE(SUM(current_value), 0)::numeric AS total_value,
       COUNT(*) FILTER (WHERE status = 'assigned')::int AS assigned,
       COUNT(*) FILTER (WHERE status = 'available')::int AS available,
       COUNT(*) FILTER (WHERE warranty_end <= CURRENT_DATE + INTERVAL '30 days' AND warranty_end >= CURRENT_DATE)::int AS warranty_expiring
     FROM assets
     WHERE ($1::uuid IS NULL OR organization_id = $1::uuid)`,
    [ctx.organizationId ?? null],
  );
  const dep = await query<Record<string, unknown>>(
    `SELECT COALESCE(SUM((purchase_cost_eur - COALESCE(salvage_value, 0)) / NULLIF(ac.useful_life_months, 0)), 0)::numeric AS depreciation_month
     FROM assets a
     LEFT JOIN asset_categories ac ON ac.id = a.category_id
     WHERE ($1::uuid IS NULL OR a.organization_id = $1::uuid)
       AND ac.depreciation_method = 'straight_line'
       AND a.status != 'retired'`,
    [ctx.organizationId ?? null],
  );
  const row = summary.rows[0] ?? {};
  return {
    totalAssets: toNum(row.total_assets),
    totalValue: toNum(row.total_value),
    assigned: toNum(row.assigned),
    available: toNum(row.available),
    warrantyExpiring: toNum(row.warranty_expiring),
    depreciationThisMonth: toNum(dep.rows[0]?.depreciation_month),
  };
}

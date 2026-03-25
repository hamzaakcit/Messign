import { query } from '../../db/index.js';
import { auditService } from './auditService.js';

export interface CreateVendorInput {
  name: string;
  legal_name?: string;
  tax_id?: string;
  vendor_code?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  country?: string;
  default_currency?: string;
  payment_terms?: string;
  default_gl_code?: string;
}

export const vendorService = {
  async create(data: CreateVendorInput, userId: string, orgId: string) {
    const result = await query(
      `INSERT INTO finance_vendors
       (organization_id, tenant_id, name, legal_name, tax_id, vendor_code, email, phone, website,
        address, country, default_currency, payment_terms, default_gl_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        orgId, orgId, data.name, data.legal_name ?? null, data.tax_id ?? null,
        data.vendor_code ?? null, data.email ?? null, data.phone ?? null,
        data.website ?? null, data.address ?? null, data.country ?? null,
        data.default_currency ?? 'USD', data.payment_terms ?? 'Net 30',
        data.default_gl_code ?? null,
      ],
    );

    await auditService.log({
      organization_id: orgId,
      event_type: 'vendor.created',
      event_category: 'vendor',
      actor_type: 'user',
      actor_id: userId,
      entity_type: 'vendor',
      entity_id: result.rows[0].id,
      changes: { name: data.name },
    });

    return result.rows[0];
  },

  async list(orgId: string, filters: { search?: string; active_only?: boolean } = {}) {
    const conditions = ['organization_id = $1'];
    const params: unknown[] = [orgId];
    let idx = 2;

    if (filters.active_only !== false) {
      conditions.push('is_active = TRUE');
    }
    if (filters.search) {
      conditions.push(`(name ILIKE $${idx} OR email ILIKE $${idx})`);
      params.push(`%${filters.search}%`);
      idx++;
    }

    const result = await query(
      `SELECT * FROM finance_vendors
       WHERE ${conditions.join(' AND ')}
       ORDER BY name`,
      params,
    );
    return result.rows;
  },

  async getById(vendorId: string, orgId: string) {
    const result = await query(
      'SELECT * FROM finance_vendors WHERE id = $1 AND organization_id = $2',
      [vendorId, orgId],
    );
    return result.rows[0] ?? null;
  },

  async update(vendorId: string, data: Partial<CreateVendorInput>, userId: string, orgId: string) {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        sets.push(`${key} = $${idx++}`);
        params.push(val);
      }
    }
    if (sets.length === 0) return this.getById(vendorId, orgId);

    sets.push('updated_at = NOW()');
    params.push(vendorId, orgId);

    const result = await query(
      `UPDATE finance_vendors SET ${sets.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx++} RETURNING *`,
      params,
    );

    if (result.rows[0]) {
      await auditService.log({
        organization_id: orgId,
        event_type: 'vendor.updated',
        event_category: 'vendor',
        actor_type: 'user',
        actor_id: userId,
        entity_type: 'vendor',
        entity_id: vendorId,
        changes: data as Record<string, unknown>,
      });
    }

    return result.rows[0];
  },

  async deactivate(vendorId: string, userId: string, orgId: string) {
    await query(
      'UPDATE finance_vendors SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND organization_id = $2',
      [vendorId, orgId],
    );
    await auditService.log({
      organization_id: orgId,
      event_type: 'vendor.deactivated',
      event_category: 'vendor',
      actor_type: 'user',
      actor_id: userId,
      entity_type: 'vendor',
      entity_id: vendorId,
    });
  },
};

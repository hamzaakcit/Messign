import { query } from '../../db/index.js';
import { eventBus } from '../../events/index.js';
import type { CallerContext } from '../types.js';
import { ANALYTICS_VIEWS, refreshMaterializedViews } from '../../services/analytics/materializedViews.js';

export interface CreateOfferInput {
  application_id: string;
  salary: number;
  currency?: string;
  start_date?: string;
  offer_type?: string;
  benefits?: string;
  notes?: string;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function createOffer(ctx: CallerContext, data: CreateOfferInput): Promise<Record<string, unknown>> {
  const result = await query(
    `INSERT INTO recruitment_offers (
       application_id, salary, currency, start_date, offer_type, benefits, notes, created_by
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      data.application_id,
      data.salary,
      data.currency ?? 'EUR',
      data.start_date ?? null,
      data.offer_type ?? 'full_time',
      data.benefits ?? null,
      data.notes ?? null,
      ctx.userId,
    ],
  );
  return result.rows[0] as Record<string, unknown>;
}

export async function sendOffer(_ctx: CallerContext, offerId: string): Promise<Record<string, unknown>> {
  const result = await query(
    `UPDATE recruitment_offers
     SET status = 'sent',
         sent_at = NOW()
     WHERE id = $1::uuid
     RETURNING *`,
    [offerId],
  );
  const offer = result.rows[0] as Record<string, unknown> | undefined;
  if (!offer) throw new Error('Offer not found');
  const appResult = await query<{ application_id: string; candidate_id: string }>(
    `SELECT o.application_id::text AS application_id, a.candidate_id::text AS candidate_id
     FROM recruitment_offers o
     JOIN recruitment_applications a ON a.id = o.application_id
     WHERE o.id = $1::uuid`,
    [offerId],
  );
  eventBus.emit('recruitment.offer.sent', {
    offerId,
    applicationId: appResult.rows[0]?.application_id ?? '',
    candidateId: appResult.rows[0]?.candidate_id ?? '',
    salary: toNumber(offer.salary),
    currency: String(offer.currency ?? 'EUR'),
  });
  return offer;
}

export async function acceptOffer(_ctx: CallerContext, offerId: string): Promise<Record<string, unknown>> {
  const result = await query(
    `UPDATE recruitment_offers
     SET status = 'accepted',
         responded_at = NOW()
     WHERE id = $1::uuid
     RETURNING *`,
    [offerId],
  );
  const offer = result.rows[0] as Record<string, unknown> | undefined;
  if (!offer) throw new Error('Offer not found');
  const appResult = await query<{ application_id: string; candidate_id: string; job_id: string }>(
    `SELECT
       o.application_id::text AS application_id,
       a.candidate_id::text AS candidate_id,
       a.job_id::text AS job_id
     FROM recruitment_offers o
     JOIN recruitment_applications a ON a.id = o.application_id
     WHERE o.id = $1::uuid`,
    [offerId],
  );
  const app = appResult.rows[0];
  if (app) {
    await query(
      `UPDATE recruitment_applications
       SET stage = 'hired',
           status = 'hired',
           last_stage_change_at = NOW(),
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [app.application_id],
    );
  }
  await refreshMaterializedViews([ANALYTICS_VIEWS.recruitmentFunnel]);
  eventBus.emit('recruitment.offer.accepted', {
    offerId,
    applicationId: app?.application_id ?? '',
    candidateId: app?.candidate_id ?? '',
    startDate: String(offer.start_date ?? new Date().toISOString().slice(0, 10)),
  });
  if (app) {
    const job = await query<{ department_id: string | null; department: string | null }>(
      `SELECT department_id::text, department FROM recruitment_jobs WHERE id = $1::uuid`,
      [app.job_id],
    );
    eventBus.emit('recruitment.candidate.hired', {
      applicationId: app.application_id,
      candidateId: app.candidate_id,
      jobId: app.job_id,
      departmentId: job.rows[0]?.department_id ?? job.rows[0]?.department ?? '',
      startDate: String(offer.start_date ?? new Date().toISOString().slice(0, 10)),
      salary: toNumber(offer.salary),
    });
  }
  return offer;
}

export async function rejectOffer(_ctx: CallerContext, offerId: string, reason?: string): Promise<Record<string, unknown>> {
  const result = await query(
    `UPDATE recruitment_offers
     SET status = 'rejected',
         rejection_reason = $1,
         responded_at = NOW()
     WHERE id = $2::uuid
     RETURNING *`,
    [reason ?? null, offerId],
  );
  const offer = result.rows[0] as Record<string, unknown> | undefined;
  if (!offer) throw new Error('Offer not found');
  const appResult = await query<{ application_id: string; candidate_id: string }>(
    `SELECT o.application_id::text AS application_id, a.candidate_id::text AS candidate_id
     FROM recruitment_offers o
     JOIN recruitment_applications a ON a.id = o.application_id
     WHERE o.id = $1::uuid`,
    [offerId],
  );
  eventBus.emit('recruitment.offer.rejected', {
    offerId,
    applicationId: appResult.rows[0]?.application_id ?? '',
    candidateId: appResult.rows[0]?.candidate_id ?? '',
    reason,
  });
  return offer;
}

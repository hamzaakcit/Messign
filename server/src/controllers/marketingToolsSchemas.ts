import { z } from 'zod';

/** Channel mix: list of channel keys aligned with marketing_campaigns.channel enum + common extras */
export const campaignChannelSchema = z.enum([
  'email',
  'social',
  'paid_search',
  'paid_social',
  'content',
  'event',
  'webinar',
  'referral',
  'other',
]);

export const createCampaignToolSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  /** Primary channel for the campaign record */
  channel: campaignChannelSchema,
  /** High-level objective (stored in goals) */
  objective: z.string().max(5000).optional(),
  /** ISO date YYYY-MM-DD */
  timeline_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeline_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Channel mix labels */
  channel_mix: z.array(z.string().max(64)).max(20).optional(),
  budget: z.number().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  target_audience: z.string().max(2000).optional(),
  /** Legacy field from UI — takes precedence over composed objective/mix */
  goals: z.string().max(10000).optional(),
  status: z.enum(['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled']).optional(),
  tags: z.array(z.string().max(100)).max(40).optional(),
  owner_id: z.string().uuid().optional(),
});

export const campaignBudgetAllocateSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  note: z.string().max(500).optional(),
});

export const assignApprovalSchema = z.object({
  content_id: z.string().uuid(),
  validation_scores: z.object({
    truth_validation: z.any().optional(),
    brand_voice_check: z.any().optional(),
    compliance_scan: z.any().optional(),
  }),
});

export const submitReviewSchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    feedback: z.string().max(8000).optional(),
    rejection_reason: z
      .enum(['off_brand', 'factually_wrong', 'wrong_audience', 'needs_polish', 'other'])
      .optional(),
    /** Alias for `rejection_reason` (frontend / external integrations) */
    reason: z.enum(['off_brand', 'factually_wrong', 'wrong_audience', 'needs_polish', 'other']).optional(),
  })
  .transform((d) => ({
    status: d.status,
    feedback: d.feedback,
    rejection_reason: d.rejection_reason ?? d.reason,
  }));

export const scheduleContentSchema = z.object({
  content_id: z.string().uuid(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  channel: z.string().max(50).optional(),
});

export type CreateCampaignToolInput = z.infer<typeof createCampaignToolSchema>;
export type CampaignBudgetAllocateInput = z.infer<typeof campaignBudgetAllocateSchema>;
export type AssignApprovalInput = z.infer<typeof assignApprovalSchema>;
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;
export type ScheduleContentInput = z.infer<typeof scheduleContentSchema>;

/**
 * TypeScript row shapes for marketing context compiler tables (see migration `072_marketing_context_compiler_tables.sql`).
 * The app uses PostgreSQL via `pg`; these types mirror table columns for compile-time safety in services.
 */
import { z } from 'zod';

export const marketingFeatureStatusSchema = z.enum([
  'shipped',
  'beta',
  'internal_only',
  'coming_soon',
  'deprecated',
]);

export const marketingBrandExampleFormatSchema = z.enum(['blog', 'email', 'social', 'other']).nullable();

export const marketingProductTruthRowSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  feature_name: z.string(),
  description: z.string().nullable(),
  status: marketingFeatureStatusSchema,
  announced: z.boolean(),
  updated_at: z.coerce.date(),
});

export const marketingApprovedClaimRowSchema = z.object({
  id: z.string().uuid(),
  claim: z.string(),
  proof_point: z.string().nullable(),
  context_tags: z.array(z.string()).nullable(),
});

export const marketingBlockedClaimRowSchema = z.object({
  id: z.string().uuid(),
  blocked_claim: z.string(),
  reason: z.string().nullable(),
});

export type MarketingFeatureStatus = z.infer<typeof marketingFeatureStatusSchema>;

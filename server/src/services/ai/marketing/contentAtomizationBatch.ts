/**
 * Content Atomization — Strategic Pivot (March 2026 roadmap)
 *
 * When a primary "hero" content asset clears approval, the product vision batches
 * derivative assets in parallel (email V2 manifest, X posts, IG carousel, LinkedIn).
 * This module is the orchestration hook; workers are stubbed until queue wiring lands.
 */

export type AtomizationJobKind =
  | 'unlayer_email_v2'
  | 'x_post'
  | 'instagram_carousel'
  | 'linkedin_post';

export interface ContentAtomizationBatchInput {
  contentId: string;
  organizationId: string;
  /** Source channel for the approved asset (e.g. instagram, email) */
  channel: string;
  /** Hero / key visual when available */
  heroImageUrl?: string | null;
}

export interface ContentAtomizationBatchResult {
  batchId: string;
  jobs: Array<{ kind: AtomizationJobKind; status: 'queued' | 'skipped'; note?: string }>;
}

/**
 * Fire-and-forget batch placeholder: logs intent and returns queued job stubs.
 * Replace with BullMQ / internal queue when Automated Batching ships.
 */
export async function runContentAtomizationAfterApproval(
  input: ContentAtomizationBatchInput,
): Promise<ContentAtomizationBatchResult> {
  const batchId = `atom_${input.contentId.slice(0, 8)}_${Date.now().toString(36)}`;
  console.log('[contentAtomization] batch scheduled', { batchId, ...input });

  const jobs: ContentAtomizationBatchResult['jobs'] = [
    { kind: 'unlayer_email_v2', status: 'queued', note: 'Design Manifest → Unlayer JSON' },
    ...Array.from({ length: 5 }, (_, i) => ({
      kind: 'x_post' as const,
      status: 'queued' as const,
      note: `Variant ${i + 1}/5`,
    })),
    {
      kind: 'instagram_carousel',
      status: 'queued',
      note: 'Modern Noir visual stack (carousel)',
    },
    { kind: 'linkedin_post', status: 'queued' },
  ];

  return { batchId, jobs };
}

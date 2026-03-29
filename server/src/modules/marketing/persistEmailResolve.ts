/**
 * Persists merged VA2 manifest + resolve metadata onto `marketing_content.body_design.va2_manifest`.
 */
import type { CallerContext } from '../../dal/types.js';
import * as contentDal from '../../dal/marketing/content.js';
import { mergeResolvedEmailImagesIntoManifestRecord } from './mergeEmailManifestImages.js';

/**
 * Merges resolved image URLs into the manifest and writes `body_design.va2_manifest` + `metadata.email_resolve`.
 */
export async function persistEmailResolveManifestToContent(
  ctx: CallerContext,
  contentId: string,
  manifest: Record<string, unknown>,
  responseBody: Record<string, unknown>,
  resolveRunId: string,
): Promise<void> {
  const row = await contentDal.getContentById(ctx, contentId);
  if (!row) return;

  const manifestCopy = JSON.parse(JSON.stringify(manifest)) as Record<string, unknown>;
  const images = responseBody.images as Record<number, string>;
  const itemImages = responseBody.itemImages as Record<string, string>;
  let merged = mergeResolvedEmailImagesIntoManifestRecord(manifestCopy, images, itemImages);
  const prevMeta =
    merged.metadata && typeof merged.metadata === 'object' && !Array.isArray(merged.metadata)
      ? { ...(merged.metadata as Record<string, unknown>) }
      : {};
  merged = {
    ...merged,
    metadata: {
      ...prevMeta,
      email_resolve: {
        resolveRunId,
        partial: Boolean(responseBody.partial),
        resolvedAt: new Date().toISOString(),
        errorCount: Array.isArray(responseBody.errors) ? (responseBody.errors as unknown[]).length : 0,
      },
    },
  };
  const prevBd =
    row.body_design && typeof row.body_design === 'object' && !Array.isArray(row.body_design)
      ? { ...(row.body_design as Record<string, unknown>) }
      : {};
  prevBd.va2_manifest = merged;
  await contentDal.updateContent(ctx, contentId, { body_design: prevBd });
}

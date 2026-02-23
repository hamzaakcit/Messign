import { query } from './index.js';

export interface ProjectShowcaseRow {
  id: string;
  project_id: string;
  impact_summary: string;
  impact_metrics: unknown;
  testimonial: string | null;
  cover_image: string | null;
  screenshots: unknown;
  is_featured: boolean;
  featured_at: string | null;
  views: number;
  likes: number;
  liked_by: unknown;
  created_at: string;
}

export async function getShowcases(): Promise<ProjectShowcaseRow[]> {
  const result = await query<ProjectShowcaseRow & { impact_metrics: unknown; screenshots: unknown; liked_by: unknown }>(
    `SELECT id, project_id, impact_summary, COALESCE(impact_metrics, '[]')::jsonb AS impact_metrics,
            testimonial, cover_image, COALESCE(screenshots, '[]')::jsonb AS screenshots,
            COALESCE(is_featured, false) AS is_featured, featured_at::text,
            COALESCE(views, 0)::int AS views, COALESCE(likes, 0)::int AS likes,
            COALESCE(liked_by, '[]')::jsonb AS liked_by, created_at::text
     FROM project_showcase
     ORDER BY is_featured DESC, created_at DESC`
  );
  return result.rows;
}

export async function getShowcaseById(id: string): Promise<ProjectShowcaseRow | null> {
  const result = await query<ProjectShowcaseRow & { impact_metrics: unknown; screenshots: unknown; liked_by: unknown }>(
    `SELECT id, project_id, impact_summary, COALESCE(impact_metrics, '[]')::jsonb AS impact_metrics,
            testimonial, cover_image, COALESCE(screenshots, '[]')::jsonb AS screenshots,
            COALESCE(is_featured, false) AS is_featured, featured_at::text,
            COALESCE(views, 0)::int AS views, COALESCE(likes, 0)::int AS likes,
            COALESCE(liked_by, '[]')::jsonb AS liked_by, created_at::text
     FROM project_showcase WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getShowcaseByProjectId(projectId: string): Promise<ProjectShowcaseRow | null> {
  const result = await query<ProjectShowcaseRow & { impact_metrics: unknown; screenshots: unknown; liked_by: unknown }>(
    `SELECT id, project_id, impact_summary, COALESCE(impact_metrics, '[]')::jsonb AS impact_metrics,
            testimonial, cover_image, COALESCE(screenshots, '[]')::jsonb AS screenshots,
            COALESCE(is_featured, false) AS is_featured, featured_at::text,
            COALESCE(views, 0)::int AS views, COALESCE(likes, 0)::int AS likes,
            COALESCE(liked_by, '[]')::jsonb AS liked_by, created_at::text
     FROM project_showcase WHERE project_id = $1`,
    [projectId]
  );
  return result.rows[0] ?? null;
}

export interface CreateShowcaseInput {
  projectId: string;
  impactSummary: string;
  impactMetrics?: { metric: string; before: string; after: string }[];
  testimonial?: string;
  coverImage?: string;
  screenshots?: string[];
}

export async function createShowcase(input: CreateShowcaseInput): Promise<ProjectShowcaseRow> {
  const id = `showcase-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await query(
    `INSERT INTO project_showcase (id, project_id, impact_summary, impact_metrics, testimonial, cover_image, screenshots)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      input.projectId,
      input.impactSummary,
      JSON.stringify(input.impactMetrics ?? []),
      input.testimonial ?? null,
      input.coverImage ?? null,
      JSON.stringify(input.screenshots ?? []),
    ]
  );
  const row = await getShowcaseById(id);
  if (!row) throw new Error('Showcase insert failed');
  return row;
}

export async function toggleShowcaseLike(id: string, userId: string): Promise<{ liked: boolean; likes: number }> {
  const row = await getShowcaseById(id);
  if (!row) throw new Error('Showcase not found');
  const likedBy = Array.isArray(row.liked_by) ? (row.liked_by as string[]) : [];
  const alreadyLiked = likedBy.includes(userId);
  const newLikedBy = alreadyLiked ? likedBy.filter((x) => x !== userId) : [...likedBy, userId];
  const newLikes = Math.max(0, row.likes + (alreadyLiked ? -1 : 1));
  await query(
    `UPDATE project_showcase SET likes = $1, liked_by = $2 WHERE id = $3`,
    [newLikes, JSON.stringify(newLikedBy), id]
  );
  return { liked: !alreadyLiked, likes: newLikes };
}

export async function toggleShowcaseFeatured(id: string): Promise<boolean> {
  const row = await getShowcaseById(id);
  if (!row) throw new Error('Showcase not found');
  const next = !row.is_featured;
  await query(
    `UPDATE project_showcase SET is_featured = $1, featured_at = $2 WHERE id = $3`,
    [next, next ? new Date().toISOString() : null, id]
  );
  return next;
}

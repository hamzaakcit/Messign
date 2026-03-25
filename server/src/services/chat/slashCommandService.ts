import { query } from '../../db/index.js';

export interface SlashSearchResult {
  type: 'task' | 'document' | 'user';
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  avatarUrl?: string;
  metadata?: Record<string, unknown>;
}

export async function searchTasks(searchQuery: string, limit: number = 10): Promise<SlashSearchResult[]> {
  const result = await query<{
    id: string;
    title: string;
    status: string;
    priority: string;
    project_name: string | null;
  }>(
    `SELECT t.id, t.title, t.status, t.priority,
            p.name AS project_name
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.title ILIKE $1
     ORDER BY t.created_at DESC
     LIMIT $2`,
    [`%${searchQuery}%`, limit],
  );

  return result.rows.map((r) => ({
    type: 'task' as const,
    id: r.id,
    title: r.title,
    subtitle: r.project_name ?? undefined,
    status: r.status,
    metadata: { priority: r.priority },
  }));
}

export async function searchDocuments(searchQuery: string, limit: number = 10): Promise<SlashSearchResult[]> {
  try {
    const result = await query<{
      id: string;
      title: string;
      status: string;
      author_name: string | null;
    }>(
      `SELECT d.id, d.title, d.status,
              COALESCE(u.full_name, d.author_id::text) AS author_name
       FROM knowledge_documents d
       LEFT JOIN reimbursement_users u ON u.id = d.author_id OR u.auth_user_id = d.author_id::text
       WHERE d.title ILIKE $1
       ORDER BY d.updated_at DESC
       LIMIT $2`,
      [`%${searchQuery}%`, limit],
    );

    return result.rows.map((r) => ({
      type: 'document' as const,
      id: r.id,
      title: r.title,
      subtitle: r.author_name ?? undefined,
      status: r.status,
    }));
  } catch {
    return [];
  }
}

export async function searchUsers(searchQuery: string, limit: number = 10): Promise<SlashSearchResult[]> {
  const result = await query<{
    id: string;
    full_name: string;
    job_title: string | null;
    department: string | null;
    avatar_url: string | null;
    status: string | null;
  }>(
    `SELECT id::text, full_name, job_title, department, avatar_url,
            status
     FROM reimbursement_users
     WHERE full_name ILIKE $1 OR email ILIKE $1
     ORDER BY full_name ASC
     LIMIT $2`,
    [`%${searchQuery}%`, limit],
  );

  return result.rows.map((r) => ({
    type: 'user' as const,
    id: r.id,
    title: r.full_name,
    subtitle: r.job_title ?? r.department ?? undefined,
    avatarUrl: r.avatar_url ?? undefined,
    status: r.status ?? undefined,
  }));
}

export async function slashSearch(
  type: 'task' | 'document' | 'user' | 'all',
  searchQuery: string,
  limit: number = 10,
): Promise<SlashSearchResult[]> {
  if (!searchQuery.trim()) return [];

  switch (type) {
    case 'task':
      return searchTasks(searchQuery, limit);
    case 'document':
      return searchDocuments(searchQuery, limit);
    case 'user':
      return searchUsers(searchQuery, limit);
    case 'all': {
      const perType = Math.max(3, Math.floor(limit / 3));
      const [tasks, docs, users] = await Promise.all([
        searchTasks(searchQuery, perType),
        searchDocuments(searchQuery, perType),
        searchUsers(searchQuery, perType),
      ]);
      return [...tasks, ...docs, ...users].slice(0, limit);
    }
    default:
      return [];
  }
}

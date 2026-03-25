import { query } from '../../db/index.js';

export interface EmbeddedTaskCard {
  type: 'task';
  id: string;
  title: string;
  status: string;
  priority: string;
  assignees: string[];
  assigneeNames: string[];
  projectId: string;
  projectName: string;
  dueDate?: string;
  xpReward: number;
}

export interface EmbeddedDocCard {
  type: 'document';
  id: string;
  title: string;
  excerpt: string;
  authorName: string;
  updatedAt: string;
  status: string;
  category?: string;
}

export type EmbeddedCard = EmbeddedTaskCard | EmbeddedDocCard;

export async function resolveTaskCard(taskId: string): Promise<EmbeddedTaskCard | null> {
  const result = await query<{
    id: string;
    title: string;
    status: string;
    priority: string;
    assignees: string[];
    project_id: string;
    project_name: string | null;
    due_date: string | null;
    xp_reward: number;
  }>(
    `SELECT t.id, t.title, t.status, t.priority,
            COALESCE(t.assignees, '[]'::jsonb) AS assignees,
            t.project_id,
            p.name AS project_name,
            t.due_date,
            COALESCE(t.xp_reward, 0) AS xp_reward
     FROM tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.id = $1`,
    [taskId],
  );

  const row = result.rows[0];
  if (!row) return null;

  const assigneeIds: string[] = Array.isArray(row.assignees) ? row.assignees : [];
  let assigneeNames: string[] = [];
  if (assigneeIds.length > 0) {
    const namesResult = await query<{ full_name: string }>(
      `SELECT full_name FROM reimbursement_users
       WHERE auth_user_id = ANY($1) OR id::text = ANY($1)`,
      [assigneeIds],
    );
    assigneeNames = namesResult.rows.map((r) => r.full_name);
  }

  return {
    type: 'task',
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    assignees: assigneeIds,
    assigneeNames,
    projectId: row.project_id,
    projectName: row.project_name ?? 'Unknown Project',
    dueDate: row.due_date ?? undefined,
    xpReward: row.xp_reward,
  };
}

export async function resolveDocCard(docId: string): Promise<EmbeddedDocCard | null> {
  try {
    const result = await query<{
      id: string;
      title: string;
      content: string;
      author_name: string | null;
      updated_at: string;
      status: string;
      category_name: string | null;
    }>(
      `SELECT d.id, d.title,
              SUBSTRING(d.content, 1, 200) AS content,
              COALESCE(u.full_name, d.author_id::text) AS author_name,
              d.updated_at,
              COALESCE(d.status, 'published') AS status,
              c.name AS category_name
       FROM knowledge_documents d
       LEFT JOIN reimbursement_users u ON u.id = d.author_id OR u.auth_user_id = d.author_id::text
       LEFT JOIN knowledge_categories c ON c.id = d.category_id
       WHERE d.id = $1`,
      [docId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      type: 'document',
      id: row.id,
      title: row.title,
      excerpt: row.content,
      authorName: row.author_name ?? 'Unknown',
      updatedAt: row.updated_at,
      status: row.status,
      category: row.category_name ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function resolveEmbeddedCard(type: string, refId: string): Promise<EmbeddedCard | null> {
  switch (type) {
    case 'task':
      return resolveTaskCard(refId);
    case 'document':
      return resolveDocCard(refId);
    default:
      return null;
  }
}

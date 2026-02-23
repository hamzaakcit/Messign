import { query } from './index.js';
import type { Task } from '../types/index.js';

interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  assignees: string[];
  tags: string[];
  due_date: string | null;
  xp_reward: number;
  priority: string;
  created_at: string;
  completed_at: string | null;
}

function mapRowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description ?? '',
    status: row.status as Task['status'],
    assignees: Array.isArray(row.assignees) ? row.assignees : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    dueDate: row.due_date ?? undefined,
    xpReward: row.xp_reward ?? 50,
    priority: row.priority as Task['priority'],
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export async function getTaskById(id: string): Promise<Task | null> {
  const result = await query<TaskRow>(
    `SELECT id, project_id, title, description, status, COALESCE(assignees, '[]')::jsonb AS assignees,
            COALESCE(tags, '[]')::jsonb AS tags, due_date, COALESCE(xp_reward, 50)::int AS xp_reward, priority,
            created_at::text AS created_at, completed_at::text AS completed_at
     FROM tasks WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  return row ? mapRowToTask(row) : null;
}

export async function getTasksByProject(projectId: string): Promise<Task[]> {
  const result = await query<TaskRow>(
    `SELECT id, project_id, title, description, status, COALESCE(assignees, '[]')::jsonb AS assignees,
            COALESCE(tags, '[]')::jsonb AS tags, due_date, COALESCE(xp_reward, 50)::int AS xp_reward, priority,
            created_at::text AS created_at, completed_at::text AS completed_at
     FROM tasks WHERE project_id = $1 ORDER BY created_at DESC`,
    [projectId]
  );
  return result.rows.map(mapRowToTask);
}

export async function getAllTasks(): Promise<Task[]> {
  const result = await query<TaskRow>(
    `SELECT id, project_id, title, description, status, COALESCE(assignees, '[]')::jsonb AS assignees,
            COALESCE(tags, '[]')::jsonb AS tags, due_date, COALESCE(xp_reward, 50)::int AS xp_reward, priority,
            created_at::text AS created_at, completed_at::text AS completed_at
     FROM tasks ORDER BY created_at DESC`
  );
  return result.rows.map(mapRowToTask);
}

export async function updateTaskStatus(taskId: string, status: Task['status']): Promise<Task | null> {
  const completedAt = status === 'done' ? new Date().toISOString() : null;
  await query(
    `UPDATE tasks SET status = $1, completed_at = $2 WHERE id = $3`,
    [status, completedAt, taskId]
  );
  return getTaskById(taskId);
}

export async function addTask(task: Omit<Task, 'id'> & { id?: string }): Promise<Task> {
  const id = task.id ?? `task-${Date.now()}`;
  await query(
    `INSERT INTO tasks (id, project_id, title, description, status, assignees, tags, due_date, xp_reward, priority)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      task.projectId,
      task.title,
      task.description ?? '',
      task.status ?? 'todo',
      JSON.stringify(task.assignees ?? []),
      JSON.stringify(task.tags ?? []),
      task.dueDate ?? null,
      task.xpReward ?? 50,
      task.priority ?? 'medium',
    ]
  );
  const out = await getTaskById(id);
  if (!out) throw new Error('Task insert failed');
  return out;
}

export async function deleteTask(taskId: string): Promise<boolean> {
  const result = await query('DELETE FROM tasks WHERE id = $1', [taskId]);
  return (result.rowCount ?? 0) > 0;
}

export async function updateTask(taskId: string, updates: Partial<Omit<Task, 'id' | 'projectId'>>): Promise<Task | null> {
  const current = await getTaskById(taskId);
  if (!current) return null;
  const title = updates.title ?? current.title;
  const description = updates.description ?? current.description;
  const status = updates.status ?? current.status;
  const assignees = updates.assignees ?? current.assignees;
  const tags = updates.tags ?? current.tags;
  const dueDate = updates.dueDate !== undefined ? updates.dueDate : current.dueDate;
  const xpReward = updates.xpReward ?? current.xpReward;
  const priority = updates.priority ?? current.priority;
  const completedAt = status === 'done' ? (updates.completedAt ?? new Date().toISOString()) : null;
  await query(
    `UPDATE tasks SET title = $1, description = $2, status = $3, assignees = $4, tags = $5, due_date = $6, xp_reward = $7, priority = $8, completed_at = $9
     WHERE id = $10`,
    [title, description, status, JSON.stringify(assignees), JSON.stringify(tags), dueDate ?? null, xpReward, priority, completedAt, taskId]
  );
  return getTaskById(taskId);
}

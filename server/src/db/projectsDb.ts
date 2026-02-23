import { query } from './index.js';
import type { Project } from '../types/index.js';
import { addTask } from './tasksDb.js';

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  type: string;
  progress: number;
  team: string[];
  capacity: { current: number; max: number };
  status: string;
  due_date: string | null;
  created_at: string;
}

function mapRowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as Project['type'],
    progress: row.progress ?? 0,
    team: Array.isArray(row.team) ? row.team : [],
    capacity: row.capacity && typeof row.capacity === 'object' ? row.capacity as { current: number; max: number } : { current: 0, max: 5 },
    status: row.status as Project['status'],
    dueDate: row.due_date ?? undefined,
    createdAt: row.created_at,
  };
}

export async function getProjectById(id: string): Promise<Project | null> {
  const result = await query<ProjectRow>(
    `SELECT id, name, description, type, COALESCE(progress, 0)::int AS progress, COALESCE(team, '[]')::jsonb AS team,
            COALESCE(capacity, '{"current":0,"max":5}')::jsonb AS capacity, status, due_date, created_at::text AS created_at
     FROM projects WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  return row ? mapRowToProject(row) : null;
}

export async function getActiveProjects(): Promise<Project[]> {
  const result = await query<ProjectRow>(
    `SELECT id, name, description, type, COALESCE(progress, 0)::int AS progress, COALESCE(team, '[]')::jsonb AS team,
            COALESCE(capacity, '{"current":0,"max":5}')::jsonb AS capacity, status, due_date, created_at::text AS created_at
     FROM projects WHERE status = 'active' ORDER BY created_at DESC`
  );
  return result.rows.map(mapRowToProject);
}

export async function getAllProjects(): Promise<Project[]> {
  const result = await query<ProjectRow>(
    `SELECT id, name, description, type, COALESCE(progress, 0)::int AS progress, COALESCE(team, '[]')::jsonb AS team,
            COALESCE(capacity, '{"current":0,"max":5}')::jsonb AS capacity, status, due_date, created_at::text AS created_at
     FROM projects ORDER BY created_at DESC`
  );
  return result.rows.map(mapRowToProject);
}

export async function addProject(project: Omit<Project, 'id'> & { id?: string }): Promise<Project> {
  const id = project.id ?? `project-${Date.now()}`;
  await query(
    `INSERT INTO projects (id, name, description, type, progress, team, capacity, status, due_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      project.name,
      project.description,
      project.type ?? 'product',
      project.progress ?? 0,
      JSON.stringify(project.team ?? []),
      JSON.stringify(project.capacity ?? { current: project.team?.length ?? 0, max: 5 }),
      project.status ?? 'active',
      project.dueDate ?? null,
    ]
  );
  const out = await getProjectById(id);
  if (!out) throw new Error('Project insert failed');
  return out;
}

export async function updateProjectProgress(id: string, progress: number): Promise<Project | null> {
  await query(`UPDATE projects SET progress = $1, updated_at = NOW() WHERE id = $2`, [progress, id]);
  return getProjectById(id);
}

export interface RecruitmentSlot {
  dept: string;
  count: number;
  filled: number;
  /** Starter tasks created for the user when their application is accepted */
  default_tasks?: string[];
}

export type OpportunityType = 'project' | 'side_op';
export type RewardCurrency = 'XP' | 'MSP';

export interface ProjectWithApplicationCount {
  id: string;
  name: string;
  description: string;
  type: string;
  progress: number;
  team: string[];
  capacity: { current: number; max: number };
  status: string;
  due_date: string | null;
  created_at: string;
  recruitment_status: string;
  recruitment_config: RecruitmentSlot[];
  xp_reward: number;
  is_featured: boolean;
  application_count: number;
  tags?: string[];
  /** Opportunity Hub: 'project' (team, long-term) or 'side_op' (up to 2 people, quick) */
  opportunity_type?: OpportunityType;
  /** Messign Special Projects Division - premium tier */
  is_mspd?: boolean;
  /** 'XP' or 'MSP' - default MSP when is_mspd is true */
  reward_currency?: RewardCurrency;
  /** For side ops: estimated time in minutes */
  estimated_minutes?: number | null;
}

const allProjectsSelectWithTags = `SELECT p.id, p.name, p.description, p.type, COALESCE(p.progress, 0)::int AS progress,
            COALESCE(p.team, '[]')::jsonb AS team, COALESCE(p.capacity, '{"current":0,"max":5}')::jsonb AS capacity,
            p.status, p.due_date, p.created_at::text AS created_at,
            COALESCE(p.recruitment_status, 'closed') AS recruitment_status,
            COALESCE(p.recruitment_config, '[]')::jsonb AS recruitment_config,
            COALESCE(p.xp_reward, 0)::int AS xp_reward,
            COALESCE(p.is_featured, false)::boolean AS is_featured,
            COALESCE(p.tags, '{}') AS tags,
            (SELECT COUNT(*)::int FROM project_applications pa WHERE pa.project_id = p.id AND pa.status = 'pending') AS application_count
     FROM projects p ORDER BY p.created_at DESC`;

const allProjectsSelectWithoutTags = `SELECT p.id, p.name, p.description, p.type, COALESCE(p.progress, 0)::int AS progress,
            COALESCE(p.team, '[]')::jsonb AS team, COALESCE(p.capacity, '{"current":0,"max":5}')::jsonb AS capacity,
            p.status, p.due_date, p.created_at::text AS created_at,
            COALESCE(p.recruitment_status, 'closed') AS recruitment_status,
            COALESCE(p.recruitment_config, '[]')::jsonb AS recruitment_config,
            COALESCE(p.xp_reward, 0)::int AS xp_reward,
            COALESCE(p.is_featured, false)::boolean AS is_featured,
            (SELECT COUNT(*)::int FROM project_applications pa WHERE pa.project_id = p.id AND pa.status = 'pending') AS application_count
     FROM projects p ORDER BY p.created_at DESC`;

export async function getAllProjectsWithApplicationCounts(): Promise<ProjectWithApplicationCount[]> {
  let result: { rows: ProjectWithApplicationCount[] };
  try {
    result = await query<ProjectWithApplicationCount>(allProjectsSelectWithTags);
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.includes('tags') || msg.includes('does not exist') || msg.includes('column')) {
      result = await query<ProjectWithApplicationCount>(allProjectsSelectWithoutTags);
      result.rows = result.rows.map((r) => ({ ...r, tags: [] }));
    } else {
      throw err;
    }
  }
  return result.rows.map((row) => ({
    ...row,
    recruitment_config: Array.isArray(row.recruitment_config) ? row.recruitment_config : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
  }));
}

export async function getProjectByIdForAdmin(id: string): Promise<ProjectWithApplicationCount | null> {
  const baseSelect = allProjectsSelectWithTags.replace('ORDER BY p.created_at DESC', '');
  let result: { rows: ProjectWithApplicationCount[] };
  try {
    result = await query<ProjectWithApplicationCount>(`${baseSelect} WHERE p.id = $1`, [id]);
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.includes('tags') || msg.includes('does not exist') || msg.includes('column')) {
      const baseWithoutTags = allProjectsSelectWithoutTags.replace('ORDER BY p.created_at DESC', '');
      result = await query<ProjectWithApplicationCount>(`${baseWithoutTags} WHERE p.id = $1`, [id]);
      result.rows = result.rows.map((r) => ({ ...r, tags: [] }));
    } else {
      throw err;
    }
  }
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    recruitment_config: Array.isArray(row.recruitment_config) ? row.recruitment_config : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
  };
}

export interface UpdateProjectAdminData {
  name?: string;
  description?: string;
  type?: string;
  recruitment_status?: string;
  recruitment_config?: RecruitmentSlot[];
  xp_reward?: number;
  is_featured?: boolean;
  due_date?: string | null;
  tags?: string[];
}

export async function updateProjectAdmin(id: string, data: UpdateProjectAdminData): Promise<ProjectWithApplicationCount | null> {
  const updates: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let idx = 1;
  if (data.name !== undefined) {
    updates.push(`name = $${idx++}`);
    params.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push(`description = $${idx++}`);
    params.push(data.description);
  }
  if (data.type !== undefined) {
    updates.push(`type = $${idx++}`);
    params.push(data.type);
  }
  if (data.recruitment_status !== undefined) {
    updates.push(`recruitment_status = $${idx++}`);
    params.push(data.recruitment_status);
  }
  if (data.recruitment_config !== undefined) {
    updates.push(`recruitment_config = $${idx++}::jsonb`);
    params.push(JSON.stringify(data.recruitment_config));
  }
  if (data.xp_reward !== undefined) {
    updates.push(`xp_reward = $${idx++}`);
    params.push(data.xp_reward);
  }
  if (data.is_featured !== undefined) {
    updates.push(`is_featured = $${idx++}`);
    params.push(data.is_featured);
  }
  if (data.due_date !== undefined) {
    updates.push(`due_date = $${idx++}`);
    params.push(data.due_date);
  }
  if (data.tags !== undefined) {
    updates.push(`tags = $${idx++}`);
    params.push(Array.isArray(data.tags) ? data.tags : []);
  }
  if (params.length === 0) return getProjectByIdForAdmin(id);
  params.push(id);
  await query(`UPDATE projects SET ${updates.join(', ')} WHERE id = $${idx}`, params);
  return getProjectByIdForAdmin(id);
}

export async function addProjectWithRecruitment(project: {
  name: string;
  description: string;
  type?: string;
  progress?: number;
  team?: string[];
  capacity?: { current: number; max: number };
  status?: string;
  due_date?: string | null;
  recruitment_status?: string;
  recruitment_config?: RecruitmentSlot[];
  xp_reward?: number;
  is_featured?: boolean;
  tags?: string[];
  opportunity_type?: OpportunityType;
  is_mspd?: boolean;
  reward_currency?: RewardCurrency;
  estimated_minutes?: number | null;
}): Promise<ProjectWithApplicationCount> {
  const id = `project-${Date.now()}`;
  const recruitmentStatus = project.recruitment_status ?? 'closed';
  const recruitmentConfig = project.recruitment_config ?? [];
  const xpReward = project.xp_reward ?? 0;
  const isFeatured = project.is_featured ?? false;
  const tags = Array.isArray(project.tags) ? project.tags : [];
  const isMspd = Boolean(project.is_mspd);
  const rewardCurrency = project.reward_currency ?? (isMspd ? 'MSP' : 'XP');
  const opportunityType = project.opportunity_type ?? 'project';
  const estimatedMinutes = project.estimated_minutes ?? null;
  try {
    await query(
      `INSERT INTO projects (id, name, description, type, progress, team, capacity, status, due_date, recruitment_status, recruitment_config, xp_reward, is_featured, tags, opportunity_type, is_mspd, reward_currency, estimated_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, $17, $18)`,
      [
        id,
        project.name,
        project.description,
        project.type ?? 'product',
        project.progress ?? 0,
        JSON.stringify(project.team ?? []),
        JSON.stringify(project.capacity ?? { current: 0, max: 5 }),
        project.status ?? 'active',
        project.due_date ?? null,
        recruitmentStatus,
        JSON.stringify(recruitmentConfig),
        xpReward,
        isFeatured,
        tags,
        opportunityType,
        isMspd,
        rewardCurrency,
        estimatedMinutes,
      ]
    );
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.includes('opportunity_type') || msg.includes('is_mspd') || msg.includes('reward_currency') || msg.includes('estimated_minutes') || msg.includes('tags') || msg.includes('does not exist') || msg.includes('column')) {
      await query(
        `INSERT INTO projects (id, name, description, type, progress, team, capacity, status, due_date, recruitment_status, recruitment_config, xp_reward, is_featured, tags)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14)`,
        [
          id,
          project.name,
          project.description,
          project.type ?? 'product',
          project.progress ?? 0,
          JSON.stringify(project.team ?? []),
          JSON.stringify(project.capacity ?? { current: 0, max: 5 }),
          project.status ?? 'active',
          project.due_date ?? null,
          recruitmentStatus,
          JSON.stringify(recruitmentConfig),
          xpReward,
          isFeatured,
          tags,
        ]
      );
    } else {
      throw err;
    }
  }
  const list = await getAllProjectsWithApplicationCounts();
  const created = list.find((p) => p.id === id);
  if (!created) throw new Error('Project insert failed');
  return created;
}

// --- Marketplace (user-facing) ---

export interface MarketplaceProject extends ProjectWithApplicationCount {
  user_application_status: 'pending' | 'approved' | 'rejected' | 'none';
}

const marketplaceOrder = `ORDER BY COALESCE(p.is_mspd, false) DESC, CASE COALESCE(p.opportunity_type, 'project') WHEN 'side_op' THEN 2 ELSE 1 END, p.created_at DESC`;

const marketplaceSelectWithTags = `SELECT p.id, p.name, p.description, p.type, COALESCE(p.progress, 0)::int AS progress,
            COALESCE(p.team, '[]')::jsonb AS team, COALESCE(p.capacity, '{"current":0,"max":5}')::jsonb AS capacity,
            p.status, p.due_date, p.created_at::text AS created_at,
            COALESCE(p.recruitment_status, 'closed') AS recruitment_status,
            COALESCE(p.recruitment_config, '[]')::jsonb AS recruitment_config,
            COALESCE(p.xp_reward, 0)::int AS xp_reward,
            COALESCE(p.is_featured, false)::boolean AS is_featured,
            COALESCE(p.tags, '{}') AS tags,
            (SELECT COUNT(*)::int FROM project_applications pa WHERE pa.project_id = p.id AND pa.status = 'pending') AS application_count,
            COALESCE(
              (SELECT pa.status FROM project_applications pa WHERE pa.project_id = p.id AND pa.user_id = $1 LIMIT 1),
              'none'
            ) AS user_application_status,
            COALESCE(p.opportunity_type, 'project') AS opportunity_type,
            COALESCE(p.is_mspd, false)::boolean AS is_mspd,
            COALESCE(p.reward_currency, CASE WHEN COALESCE(p.is_mspd, false) THEN 'MSP' ELSE 'XP' END) AS reward_currency,
            p.estimated_minutes
     FROM projects p
     WHERE COALESCE(p.recruitment_status, 'closed') IN ('recruiting', 'active')
     ${marketplaceOrder}`;

const marketplaceSelectWithoutTags = `SELECT p.id, p.name, p.description, p.type, COALESCE(p.progress, 0)::int AS progress,
            COALESCE(p.team, '[]')::jsonb AS team, COALESCE(p.capacity, '{"current":0,"max":5}')::jsonb AS capacity,
            p.status, p.due_date, p.created_at::text AS created_at,
            COALESCE(p.recruitment_status, 'closed') AS recruitment_status,
            COALESCE(p.recruitment_config, '[]')::jsonb AS recruitment_config,
            COALESCE(p.xp_reward, 0)::int AS xp_reward,
            COALESCE(p.is_featured, false)::boolean AS is_featured,
            (SELECT COUNT(*)::int FROM project_applications pa WHERE pa.project_id = p.id AND pa.status = 'pending') AS application_count,
            COALESCE(
              (SELECT pa.status FROM project_applications pa WHERE pa.project_id = p.id AND pa.user_id = $1 LIMIT 1),
              'none'
            ) AS user_application_status
     FROM projects p
     WHERE COALESCE(p.recruitment_status, 'closed') IN ('recruiting', 'active')
     ORDER BY p.created_at DESC`;

export async function getMarketplaceProjects(userId: string): Promise<MarketplaceProject[]> {
  type Row = ProjectWithApplicationCount & { user_application_status: string; tags?: string[] };
  let result: { rows: Row[] };
  try {
    result = await query<Row>(marketplaceSelectWithTags, [userId]);
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.includes('tags') || msg.includes('opportunity_type') || msg.includes('is_mspd') || msg.includes('reward_currency') || msg.includes('does not exist') || msg.includes('column')) {
      result = await query<Row>(marketplaceSelectWithoutTags, [userId]);
      result.rows = result.rows.map((r) => ({
        ...r,
        tags: [],
        opportunity_type: 'project' as const,
        is_mspd: false,
        reward_currency: 'XP' as const,
        estimated_minutes: null,
      }));
    } else {
      throw err;
    }
  }
  return result.rows.map((row) => ({
    ...row,
    recruitment_config: Array.isArray(row.recruitment_config) ? row.recruitment_config : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    opportunity_type: (row as { opportunity_type?: string }).opportunity_type === 'side_op' ? 'side_op' : 'project',
    is_mspd: Boolean((row as { is_mspd?: boolean }).is_mspd),
    reward_currency: ((row as { reward_currency?: string }).reward_currency === 'MSP' ? 'MSP' : 'XP') as RewardCurrency,
    estimated_minutes: (row as { estimated_minutes?: number | null }).estimated_minutes ?? null,
    user_application_status: (row.user_application_status === 'pending' || row.user_application_status === 'approved' || row.user_application_status === 'rejected'
      ? row.user_application_status
      : 'none') as MarketplaceProject['user_application_status'],
  }));
}

/** Get project recruitment_config and status for apply validation */
export async function getProjectRecruitmentInfo(
  projectId: string
): Promise<{ recruitment_config: RecruitmentSlot[]; recruitment_status: string } | null> {
  const result = await query<{ recruitment_config: RecruitmentSlot[]; recruitment_status: string }>(
    `SELECT COALESCE(recruitment_config, '[]')::jsonb AS recruitment_config,
            COALESCE(recruitment_status, 'closed') AS recruitment_status
     FROM projects WHERE id = $1`,
    [projectId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    recruitment_config: Array.isArray(row.recruitment_config) ? row.recruitment_config : [],
    recruitment_status: row.recruitment_status,
  };
}

/** Departments that have at least one open slot (filled < count). Normalized to lowercase. */
export function getRequestedDepartmentsForApply(recruitmentConfig: RecruitmentSlot[]): string[] {
  const depts = new Set<string>();
  for (const slot of recruitmentConfig) {
    if (slot.filled < slot.count) {
      depts.add((slot.dept || '').toLowerCase().trim());
    }
  }
  return [...depts].filter(Boolean);
}

export async function applyToProject(projectId: string, userId: string, message?: string): Promise<{ status: string }> {
  await query(
    `INSERT INTO project_applications (project_id, user_id, status, message)
     VALUES ($1, $2, 'pending', $3)
     ON CONFLICT (project_id, user_id) DO UPDATE SET message = EXCLUDED.message, status = 'pending'`,
    [projectId, userId, message ?? null]
  );
  return { status: 'pending' };
}

export interface UserApplication {
  id: string;
  project_id: string;
  project_name: string;
  status: string;
  message: string | null;
  created_at: string;
}

export async function getApplicationsByUser(userId: string): Promise<UserApplication[]> {
  const result = await query<UserApplication>(
    `SELECT pa.id, pa.project_id, p.name AS project_name, pa.status, pa.message, pa.created_at::text AS created_at
     FROM project_applications pa
     JOIN projects p ON p.id = pa.project_id
     WHERE pa.user_id = $1
     ORDER BY pa.created_at DESC`,
    [userId]
  );
  return result.rows;
}

// --- Pending approval & approve/reject ---

const pendingSelectWithTags = `SELECT p.id, p.name, p.description, p.type, COALESCE(p.progress, 0)::int AS progress,
            COALESCE(p.team, '[]')::jsonb AS team, COALESCE(p.capacity, '{"current":0,"max":5}')::jsonb AS capacity,
            p.status, p.due_date, p.created_at::text AS created_at,
            COALESCE(p.recruitment_status, 'closed') AS recruitment_status,
            COALESCE(p.recruitment_config, '[]')::jsonb AS recruitment_config,
            COALESCE(p.xp_reward, 0)::int AS xp_reward,
            COALESCE(p.is_featured, false)::boolean AS is_featured,
            COALESCE(p.tags, '{}') AS tags,
            (SELECT COUNT(*)::int FROM project_applications pa WHERE pa.project_id = p.id AND pa.status = 'pending') AS application_count
     FROM projects p
     WHERE COALESCE(p.recruitment_status, 'closed') = 'pending_approval'
     ORDER BY p.created_at ASC`;

const pendingSelectWithoutTags = `SELECT p.id, p.name, p.description, p.type, COALESCE(p.progress, 0)::int AS progress,
            COALESCE(p.team, '[]')::jsonb AS team, COALESCE(p.capacity, '{"current":0,"max":5}')::jsonb AS capacity,
            p.status, p.due_date, p.created_at::text AS created_at,
            COALESCE(p.recruitment_status, 'closed') AS recruitment_status,
            COALESCE(p.recruitment_config, '[]')::jsonb AS recruitment_config,
            COALESCE(p.xp_reward, 0)::int AS xp_reward,
            COALESCE(p.is_featured, false)::boolean AS is_featured,
            (SELECT COUNT(*)::int FROM project_applications pa WHERE pa.project_id = p.id AND pa.status = 'pending') AS application_count
     FROM projects p
     WHERE COALESCE(p.recruitment_status, 'closed') = 'pending_approval'
     ORDER BY p.created_at ASC`;

export async function getPendingApprovalProjects(): Promise<ProjectWithApplicationCount[]> {
  let result: { rows: ProjectWithApplicationCount[] };
  try {
    result = await query<ProjectWithApplicationCount>(pendingSelectWithTags);
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.includes('tags') || msg.includes('does not exist') || msg.includes('column')) {
      result = await query<ProjectWithApplicationCount>(pendingSelectWithoutTags);
      result.rows = result.rows.map((r) => ({ ...r, tags: [] }));
    } else {
      throw err;
    }
  }
  return result.rows.map((row) => ({
    ...row,
    recruitment_config: Array.isArray(row.recruitment_config) ? row.recruitment_config : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
  }));
}

export async function approveProject(
  id: string,
  params?: { xp_reward?: number; is_featured?: boolean }
): Promise<ProjectWithApplicationCount | null> {
  const updates: string[] = ["recruitment_status = 'recruiting'", 'updated_at = NOW()'];
  const values: unknown[] = [];
  let idx = 1;
  if (params?.xp_reward != null) {
    updates.push(`xp_reward = $${idx++}`);
    values.push(params.xp_reward);
  }
  if (params?.is_featured != null) {
    updates.push(`is_featured = $${idx++}`);
    values.push(params.is_featured);
  }
  values.push(id);
  await query(
    `UPDATE projects SET ${updates.join(', ')} WHERE id = $${idx}`,
    values
  );
  const list = await getAllProjectsWithApplicationCounts();
  return list.find((p) => p.id === id) ?? null;
}

export async function rejectProject(id: string, reason: string): Promise<ProjectWithApplicationCount | null> {
  await query(
    `UPDATE projects SET recruitment_status = 'rejected', rejection_reason = $1, updated_at = NOW() WHERE id = $2`,
    [reason, id]
  );
  const list = await getAllProjectsWithApplicationCounts();
  return list.find((p) => p.id === id) ?? null;
}

// --- Applications by project (admin) ---

export interface ProjectApplicationWithUser {
  id: string;
  project_id: string;
  user_id: string;
  status: string;
  message: string | null;
  review_note: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
  user_xp: number;
  user_level: number;
}

export async function getApplicationsByProjectId(projectId: string): Promise<ProjectApplicationWithUser[]> {
  const orgResult = await query<{ id: string }>(`SELECT id FROM organizations WHERE slug = 'messign' LIMIT 1`, []);
  const orgId = orgResult.rows[0]?.id;
  if (!orgId) return [];
  const result = await query<
    ProjectApplicationWithUser & {
      review_note: string | null;
    }
  >(
    `SELECT pa.id, pa.project_id, pa.user_id, pa.status, pa.message, pa.created_at::text AS created_at,
            pa.review_note,
            ru.full_name AS user_name, ru.email AS user_email,
            COALESCE(ru.xp, 0)::int AS user_xp, COALESCE(ru.level, 1)::int AS user_level
     FROM project_applications pa
     LEFT JOIN reimbursement_users ru ON ru.organization_id = $1 AND (ru.auth_user_id = pa.user_id OR ru.id::text = pa.user_id)
     WHERE pa.project_id = $2
     ORDER BY pa.created_at DESC`,
    [orgId, projectId]
  );
  return result.rows;
}

export async function acceptApplication(projectId: string, applicationId: string): Promise<boolean> {
  const appResult = await query<{ user_id: string; status: string }>(
    `SELECT user_id, status FROM project_applications WHERE id = $1 AND project_id = $2`,
    [applicationId, projectId]
  );
  const app = appResult.rows[0];
  if (!app || app.status !== 'pending') return false;

  const projResult = await query<{ team: string[]; recruitment_config: RecruitmentSlot[] }>(
    `SELECT COALESCE(team, '[]')::jsonb AS team, COALESCE(recruitment_config, '[]')::jsonb AS recruitment_config FROM projects WHERE id = $1`,
    [projectId]
  );
  const proj = projResult.rows[0];
  if (!proj) return false;

  const team = Array.isArray(proj.team) ? [...proj.team] : [];
  if (team.includes(app.user_id)) return false; // already in team

  const config = Array.isArray(proj.recruitment_config) ? (proj.recruitment_config as RecruitmentSlot[]) : [];
  let slotIndex = -1;
  for (let i = 0; i < config.length; i++) {
    if (config[i]!.filled < config[i]!.count) {
      slotIndex = i;
      break;
    }
  }
  if (slotIndex < 0) return false; // no open slot

  config[slotIndex]!.filled += 1;
  team.push(app.user_id);

  await query(
    `UPDATE project_applications SET status = 'approved' WHERE id = $1`,
    [applicationId]
  );
  await query(
    `UPDATE projects SET team = $1::jsonb, recruitment_config = $2::jsonb, updated_at = NOW() WHERE id = $3`,
    [JSON.stringify(team), JSON.stringify(config), projectId]
  );

  // Smart Onboarding: create default_tasks for the accepted user
  const slot = config[slotIndex];
  const defaultTasks = Array.isArray((slot as { default_tasks?: string[] }).default_tasks)
    ? (slot as { default_tasks: string[] }).default_tasks
    : [];
  for (const title of defaultTasks) {
    const taskTitle = typeof title === 'string' && title.trim() ? title.trim() : null;
    if (!taskTitle) continue;
    try {
      await addTask({
        projectId,
        title: taskTitle,
        description: '',
        status: 'todo',
        assignees: [app.user_id],
        tags: [],
        xpReward: 50,
        priority: 'medium',
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[acceptApplication] Failed to create default task:', taskTitle, err);
    }
  }

  return true;
}

export async function rejectApplication(applicationId: string, note?: string): Promise<boolean> {
  const result = await query(
    `UPDATE project_applications SET status = 'rejected', review_note = $1 WHERE id = $2`,
    [note ?? null, applicationId]
  );
  return (result.rowCount ?? 0) > 0;
}

// --- Complete project (caller awards XP to team members) ---

export async function completeProject(
  id: string
): Promise<{ memberCount: number; xpReward: number; team: string[] } | null> {
  const projResult = await query<{ team: string[]; xp_reward: number }>(
    `SELECT COALESCE(team, '[]')::jsonb AS team, COALESCE(xp_reward, 0)::int AS xp_reward FROM projects WHERE id = $1`,
    [id]
  );
  const proj = projResult.rows[0];
  if (!proj) return null;

  const team = Array.isArray(proj.team) ? proj.team : [];
  const xpReward = proj.xp_reward ?? 0;

  await query(
    `UPDATE projects SET status = 'completed', recruitment_status = 'closed', updated_at = NOW() WHERE id = $1`,
    [id]
  );

  return { memberCount: team.length, xpReward, team };
}

/** Delete a project and its related records (project_applications, tasks, etc. via FK CASCADE). Admin only. */
export async function deleteProject(id: string): Promise<boolean> {
  const result = await query(`DELETE FROM projects WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Dora AI Brain — Context Builder
 *
 * Builds the DoraRequestContext from the authenticated request.
 * Called once at the top of every /ai/answer request. The resulting context
 * is frozen and passed through the entire pipeline (prompt -> router -> executor
 * -> synthesis). Nothing downstream mutates it.
 */

import { query } from '../../../db/index.js';
import type {
  DoraRequestContext,
  DoraUserContext,
  DoraPageContext,
  DoraModule,
} from './types.js';

const DEFAULT_ORG_SLUG = 'messign';

const PATH_TO_MODULE: Array<{ prefix: string; module: DoraModule }> = [
  { prefix: '/admin',                  module: 'admin' },
  { prefix: '/knowledge-hub',          module: 'knowledge-hub' },
  { prefix: '/reimbursements/invoices', module: 'invoices' },
  { prefix: '/reimbursements',         module: 'reimbursements' },
  { prefix: '/projects',               module: 'projects' },
  { prefix: '/dashboard',              module: 'dashboard' },
  { prefix: '/chat',                   module: 'chat' },
  { prefix: '/achievements',           module: 'achievements' },
  { prefix: '/team',                   module: 'team-directory' },
  { prefix: '/settings',               module: 'settings' },
  { prefix: '/dora',                   module: 'dora' },
  { prefix: '/crm',                    module: 'crm' },
  { prefix: '/support',                module: 'support' },
];

function resolveModule(path: string): DoraModule {
  if (!path) return 'unknown';
  const normalized = path.toLowerCase().replace(/\/+$/, '');
  for (const { prefix, module } of PATH_TO_MODULE) {
    if (normalized.startsWith(prefix)) return module;
  }
  return 'unknown';
}

function formatTodayDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Builds the complete DoraRequestContext from an authenticated user.
 * Queries the DB for role, name, team, department, level, and MP.
 */
export async function buildDoraContext(
  userId: string,
  role: string | undefined,
  currentPath: string,
  conciseMode: boolean,
): Promise<Readonly<DoraRequestContext>> {
  const orgResult = await query<{ id: string }>(
    `SELECT id FROM organizations WHERE slug = $1 LIMIT 1`,
    [DEFAULT_ORG_SLUG],
  );
  const orgId = orgResult.rows[0]?.id;

  let userRole = role ?? 'employee';
  let userName = 'Team Member';
  let teamId: string | null = null;
  let knowledgeRole: string | null = null;
  let department = 'General';
  let level = 'L1';
  let mpPoints = 0;

  if (orgId) {
    const userResult = await query<{
      role: string;
      full_name: string;
      level: number;
      xp: number;
    }>(
      `SELECT ru.role, ru.full_name, ru.level, ru.xp
       FROM reimbursement_users ru
       WHERE ru.organization_id = $1 AND ru.auth_user_id = $2
       LIMIT 1`,
      [orgId, userId],
    );
    const u = userResult.rows[0];
    if (u) {
      userRole = u.role || userRole;
      userName = u.full_name || userName;
      level = `L${u.level ?? 1}`;
      mpPoints = u.xp ?? 0;
    }

    const krResult = await query<{ role: string }>(
      `SELECT role FROM knowledge_user_roles WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    knowledgeRole = krResult.rows[0]?.role ?? null;

    const teamResult = await query<{ team_id: string; team_name: string }>(
      `SELECT ptm.team_id, pt.team_name
       FROM performance_team_members ptm
       JOIN performance_teams pt ON pt.id = ptm.team_id
       WHERE ptm.employee_id = $1 AND ptm.is_active = TRUE
       LIMIT 1`,
      [userId],
    );
    teamId = teamResult.rows[0]?.team_id ?? null;
    if (teamResult.rows[0]?.team_name) {
      department = teamResult.rows[0].team_name;
    }
  }

  const user: DoraUserContext = {
    userId,
    userName,
    userRole: userRole as DoraUserContext['userRole'],
    department,
    teamId,
    knowledgeRole,
    level,
    mpPoints,
  };

  const page: DoraPageContext = {
    currentPath: currentPath || '',
    currentModule: resolveModule(currentPath || ''),
  };

  const ctx: DoraRequestContext = {
    user,
    page,
    timestamp: new Date().toISOString(),
    todayDate: formatTodayDate(),
    conciseMode,
  };

  return Object.freeze(ctx);
}

/**
 * Resolves user-relative identifiers in tool call arguments.
 * When the LLM outputs user_identifier="me", this replaces it with the actual userId.
 */
export function resolveUserReferences(
  args: Record<string, unknown>,
  ctx: DoraRequestContext,
): Record<string, unknown> {
  const resolved = { ...args };

  for (const key of ['user_identifier', 'employee_identifier', 'userId']) {
    const val = resolved[key];
    if (typeof val === 'string') {
      const lower = val.toLowerCase().trim();
      if (lower === 'me' || lower === 'myself' || lower === 'current_user') {
        resolved[key] = ctx.user.userId;
      }
    }
  }

  for (const key of ['team_identifier', 'teamId', 'department']) {
    const val = resolved[key];
    if (typeof val === 'string') {
      const lower = val.toLowerCase().trim();
      if (lower === 'my team' || lower === 'my department') {
        resolved[key] = ctx.user.teamId || ctx.user.department;
      }
    }
  }

  return resolved;
}

/**
 * Converts a DoraRequestContext back to the legacy ToolContext shape
 * so existing tools continue to work without modification.
 */
export function toLegacyToolContext(ctx: DoraRequestContext) {
  return {
    userId: ctx.user.userId,
    userRole: ctx.user.userRole,
    knowledgeRole: ctx.user.knowledgeRole ?? undefined,
    teamId: ctx.user.teamId ?? undefined,
    userName: ctx.user.userName,
  };
}

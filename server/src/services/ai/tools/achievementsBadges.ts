/**
 * Tool: get_achievements_leaderboard
 *
 * Badges, points, leaderboard rankings. Adapted for Messign:
 * No leaderboard table — use reimbursement_users.xp; user_badges has user_id VARCHAR.
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const DEFAULT_ORG_SLUG = 'messign';

const achievementsLeaderboardTool: Tool = {
  name: 'get_achievements_leaderboard',
  category: 'achievements',

  description: `Get leaderboard rankings, badges earned, points, and achievement progress.

Use this tool when someone asks:
- "Who's on top of the leaderboard?"
- "What badges have I earned?" or "My achievements"
- "Leaderboard rankings" or "Top performers"
- "How many points does [Name] have?"
- "What badges are available?"
- Any question about gamification, points, badges, achievements, or rankings`,

  parameters: {
    type: 'object',
    properties: {
      query_type: {
        type: 'string',
        description: 'What to look up.',
        enum: ['leaderboard', 'user_badges', 'all_badges', 'top_performers'],
      },
      user_identifier: {
        type: 'string',
        description: 'Name or "me" for user-specific queries. Not needed for leaderboard.',
      },
      limit: {
        type: 'number',
        description: 'How many results to return. Default 10.',
      },
    },
    required: ['query_type'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const queryType = (args.query_type as string) || 'leaderboard';
    const userIdentifier = (args.user_identifier as string) || '';
    const limit = Math.min((args.limit as number) || 10, 25);

    const orgResult = await query<{ id: string }>(`SELECT id FROM organizations WHERE slug = $1 LIMIT 1`, [DEFAULT_ORG_SLUG]);
    const orgId = orgResult.rows[0]?.id;
    if (!orgId) {
      return { success: false, data: null, summary: 'Organization not configured.' };
    }

    switch (queryType) {
      case 'leaderboard':
      case 'top_performers': {
        const result = await query(
          `SELECT ru.auth_user_id as user_id, COALESCE(ru.xp, 0)::int as points, ru.full_name, ru.email
           FROM reimbursement_users ru
           WHERE ru.organization_id = $1 AND ru.auth_user_id IS NOT NULL AND ru.auth_user_id != ''
           ORDER BY ru.xp DESC NULLS LAST
           LIMIT $2`,
          [orgId, limit]
        );

        const rows = result.rows as { user_id?: string; points?: number; full_name?: string }[];
        const withRank = rows.map((r, i) => ({ ...r, rank: i + 1 }));

        const summary = `**Leaderboard — Top ${withRank.length}:**\n${withRank
          .map((r, i) => `${i + 1}. ${r.full_name ?? r.user_id} — ${r.points ?? 0} points`)
          .join('\n')}`;

        return {
          success: true,
          data: withRank,
          summary,
          metadata: { source: 'reimbursement_users', count: withRank.length },
        };
      }

      case 'user_badges': {
        const identifier = userIdentifier.toLowerCase().trim();
        let targetAuthUserId: string;

        if (['me', 'my', 'myself'].includes(identifier)) {
          targetAuthUserId = context.userId;
        } else {
          const search = await query<{ auth_user_id: string }>(
            `SELECT auth_user_id FROM reimbursement_users
             WHERE organization_id = $1 AND (LOWER(full_name) LIKE LOWER($2) OR LOWER(email) LIKE LOWER($2))
               AND auth_user_id IS NOT NULL LIMIT 1`,
            [orgId, `%${identifier}%`]
          );
          if (search.rows.length === 0) {
            return { success: false, data: null, summary: `No user found: "${userIdentifier}".` };
          }
          targetAuthUserId = search.rows[0].auth_user_id;
        }

        const badgesResult = await query(
          `SELECT b.name, b.description, b.icon, ub.earned_at
           FROM user_badges ub
           JOIN badges b ON ub.badge_id = b.id
           WHERE ub.user_id = $1
           ORDER BY ub.earned_at DESC`,
          [targetAuthUserId]
        );

        const pointsResult = await query(
          `SELECT xp as points FROM reimbursement_users WHERE auth_user_id = $1 AND organization_id = $2 LIMIT 1`,
          [targetAuthUserId, orgId]
        );

        const points = (pointsResult.rows[0] as Record<string, unknown>)?.points ?? 0;
        const badges = badgesResult.rows as Record<string, unknown>[];

        const summary = `**Badges & Achievements:**
- Points: ${points} (from XP)
- Badges earned: ${badges.length}
${badges.map((b) => `  • ${b.name}: ${b.description || ''} (earned ${new Date(b.earned_at as string).toLocaleDateString()})`).join('\n')}`;

        return {
          success: true,
          data: { badges, points },
          summary,
          metadata: { source: 'user_badges, badges, reimbursement_users', count: badges.length },
        };
      }

      case 'all_badges': {
        const allBadgesResult = await query(
          `SELECT b.id, b.name, b.description, b.icon, COUNT(ub.id)::int as times_earned
           FROM badges b
           LEFT JOIN user_badges ub ON b.id = ub.badge_id
           GROUP BY b.id, b.name, b.description, b.icon
           ORDER BY times_earned DESC`
        );

        const badges = allBadgesResult.rows as Record<string, unknown>[];

        const summary = `**All Available Badges (${badges.length}):**\n${badges
          .map((b) => `• ${b.name}: ${b.description || 'No description'} (earned by ${b.times_earned} people)`)
          .join('\n')}`;

        return {
          success: true,
          data: badges,
          summary,
          metadata: { source: 'badges, user_badges', count: badges.length },
        };
      }

      default:
        return { success: false, data: null, summary: `Unknown query type: "${queryType}". Use "leaderboard", "user_badges", or "all_badges".` };
    }
  },
};

registerTool(achievementsLeaderboardTool);
export default achievementsLeaderboardTool;

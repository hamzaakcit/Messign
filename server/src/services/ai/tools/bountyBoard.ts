/**
 * Tool: get_bounty_board
 *
 * Bounties — open tasks with rewards. Adapted for Messign:
 * bounties: creator_id, claimed_by VARCHAR, xp_reward, status (OPEN, CLAIMED, etc.).
 */

import { query } from '../../../db/index.js';
import { registerTool } from '../toolRegistry.js';
import type { Tool, ToolContext, ToolResult } from '../types.js';

const bountyBoardTool: Tool = {
  name: 'get_bounty_board',
  category: 'projects',

  description: `Get bounties — open tasks with rewards that anyone can claim.

Use this tool when someone asks:
- "What bounties are available?"
- "Show me open bounties" or "Bounty board"
- "What bounties has [Name] completed?"
- "High value bounties" or "Bounties I can claim"
- Any question about bounties, rewards, or claimable tasks`,

  parameters: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'Filter bounties.',
        enum: ['open', 'claimed', 'completed', 'my_bounties', 'all'],
      },
      sort_by: {
        type: 'string',
        description: 'Sort order.',
        enum: ['reward_high', 'reward_low', 'newest', 'deadline'],
      },
    },
    required: ['filter'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const filter = (args.filter as string) || 'open';
    const sortBy = (args.sort_by as string) || 'newest';

    try {
      let whereClause = '';
      const params: unknown[] = [];

      switch (filter) {
        case 'open':
          whereClause = `WHERE b.status = 'OPEN'`;
          break;
        case 'claimed':
          whereClause = `WHERE b.status = 'CLAIMED'`;
          break;
        case 'completed':
          whereClause = `WHERE b.status = 'COMPLETED'`;
          break;
        case 'my_bounties':
          whereClause = `WHERE (b.claimed_by = $1 OR b.creator_id = $1)`;
          params.push(context.userId);
          break;
        default:
          whereClause = '';
      }

      let orderClause = 'ORDER BY b.created_at DESC';
      switch (sortBy) {
        case 'reward_high':
          orderClause = 'ORDER BY b.xp_reward DESC';
          break;
        case 'reward_low':
          orderClause = 'ORDER BY b.xp_reward ASC';
          break;
        case 'deadline':
          orderClause = 'ORDER BY b.expires_at ASC NULLS LAST';
          break;
      }

      const result = await query(
        `SELECT b.*, creator.full_name as creator_name, claimer.full_name as claimer_name
         FROM bounties b
         LEFT JOIN reimbursement_users creator ON creator.auth_user_id = b.creator_id
         LEFT JOIN reimbursement_users claimer ON claimer.auth_user_id = b.claimed_by
         ${whereClause}
         ${orderClause}
         LIMIT 20`,
        params.length > 0 ? params : undefined
      );

      const bounties = result.rows as Record<string, unknown>[];
      const totalReward = bounties.reduce((sum: number, b) => sum + ((b.xp_reward as number) || 0), 0);

      const summary = `**Bounty Board (${filter}) — ${bounties.length} bounties:**\n${bounties
        .map(
          (b, i) =>
            `${i + 1}. [${b.status}] ${b.title}: ${b.xp_reward || 0} XP — ${((b.description as string) || '').slice(0, 80)}${b.expires_at ? ` (deadline: ${new Date(b.expires_at as string).toLocaleDateString()})` : ''}${b.claimer_name ? ` — claimed by ${b.claimer_name}` : ''}`
        )
        .join('\n')}\n\nTotal reward XP: ${totalReward}`;

      return {
        success: true,
        data: bounties,
        summary,
        metadata: { source: 'bounties, reimbursement_users', count: bounties.length },
      };
    } catch (err) {
      return {
        success: false,
        data: null,
        summary: `Bounty data unavailable: ${(err as Error).message}. Your system may not have a bounties table.`,
      };
    }
  },
};

registerTool(bountyBoardTool);
export default bountyBoardTool;

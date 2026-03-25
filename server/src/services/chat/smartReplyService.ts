import { generateResponse, LLM_TIER } from '../ai/llmGateway.js';
import type { LLMGatewayResult } from '../ai/llmGateway.js';
import { query } from '../../db/index.js';

export interface SmartReplyResult {
  replies: string[];
  contextSummary: string;
}

export async function generateSmartReplies(
  channelId: string,
  userId: string,
  recentMessageCount: number = 10,
): Promise<SmartReplyResult> {
  const messagesResult = await query<{
    content: string;
    user_id: string;
    sender_name: string | null;
  }>(
    `SELECT m.content, m.user_id,
            COALESCE(u.full_name, m.user_id) AS sender_name
     FROM messages m
     LEFT JOIN reimbursement_users u ON u.auth_user_id = m.user_id OR u.id::text = m.user_id
     WHERE m.channel_id = $1 AND m.is_deleted = FALSE
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [channelId, recentMessageCount],
  );

  const messages = messagesResult.rows.reverse();
  if (messages.length === 0) {
    return { replies: [], contextSummary: '' };
  }

  const userResult = await query<{ full_name: string | null }>(
    `SELECT full_name FROM reimbursement_users
     WHERE auth_user_id = $1 OR id::text = $1
     LIMIT 1`,
    [userId],
  );
  const userName = userResult.rows[0]?.full_name ?? 'User';

  const conversation = messages
    .map((m) => `${m.sender_name ?? m.user_id}: ${m.content}`)
    .join('\n');

  let result: LLMGatewayResult;
  try {
    result = await generateResponse({
      tier: LLM_TIER.FAST,
      systemPrompt: `You are Dora, the AI assistant for Messign Workspace. Generate exactly 3 short, context-aware reply suggestions that ${userName} could send in this conversation. The replies should be professional, natural, and varied in tone (one helpful, one acknowledging, one action-oriented). Return JSON: { "replies": ["reply1", "reply2", "reply3"], "contextSummary": "brief context" }. Keep each reply under 50 words.`,
      userMessage: conversation,
      jsonMode: true,
      temperature: 0.7,
      maxTokens: 300,
    });
  } catch {
    return { replies: [], contextSummary: '' };
  }

  try {
    const parsed = JSON.parse(result.content) as { replies: string[]; contextSummary?: string };
    return {
      replies: Array.isArray(parsed.replies) ? parsed.replies.slice(0, 3) : [],
      contextSummary: parsed.contextSummary ?? '',
    };
  } catch {
    return { replies: [], contextSummary: '' };
  }
}

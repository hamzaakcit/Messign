import { generateResponse, LLM_TIER } from '../ai/llmGateway.js';
import type { LLMGatewayResult } from '../ai/llmGateway.js';
import { query } from '../../db/index.js';

export interface ChatMessage {
  id: string;
  userId: string;
  content: string;
  senderName?: string;
  timestamp: string;
}

export interface ActionItem {
  text: string;
  assignee?: string;
  priority: 'low' | 'medium' | 'high';
  sourceMessageId: string;
}

export interface KBSuggestion {
  title: string;
  excerpt: string;
  documentId: string;
  relevanceScore: number;
}

export interface DoraSummaryResult {
  summary: string;
  keyTopics: string[];
  participantCount: number;
  messageCount: number;
}

export interface DoraActionItemsResult {
  actionItems: ActionItem[];
  confidence: number;
}

export interface DoraKBSuggestionsResult {
  suggestions: KBSuggestion[];
  query: string;
}

async function fetchRecentMessages(channelId: string, limit: number = 50): Promise<ChatMessage[]> {
  const result = await query<{
    id: string;
    user_id: string;
    content: string;
    sender_name: string | null;
    created_at: string;
  }>(
    `SELECT m.id, m.user_id, m.content,
            COALESCE(u.full_name, m.user_id) AS sender_name,
            m.created_at
     FROM messages m
     LEFT JOIN reimbursement_users u ON u.auth_user_id = m.user_id OR u.id::text = m.user_id
     WHERE m.channel_id = $1 AND m.is_deleted = FALSE
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [channelId, limit],
  );
  return result.rows.reverse().map((r) => ({
    id: r.id,
    userId: r.user_id,
    content: r.content,
    senderName: r.sender_name ?? undefined,
    timestamp: r.created_at,
  }));
}

function formatConversation(messages: ChatMessage[]): string {
  return messages
    .map((m) => `[${m.senderName ?? m.userId}]: ${m.content}`)
    .join('\n');
}

export async function summarizeConversation(
  channelId: string,
  messageCount: number = 50,
): Promise<DoraSummaryResult> {
  const messages = await fetchRecentMessages(channelId, messageCount);
  if (messages.length === 0) {
    return { summary: 'No messages to summarize.', keyTopics: [], participantCount: 0, messageCount: 0 };
  }

  const conversation = formatConversation(messages);
  const participants = new Set(messages.map((m) => m.userId));

  let result: LLMGatewayResult;
  try {
    result = await generateResponse({
      tier: LLM_TIER.FAST,
      systemPrompt: `You are Dora, an AI assistant for Messign Workspace. Summarize the following team chat conversation concisely. Return JSON with: { "summary": "...", "keyTopics": ["topic1", "topic2"] }. Keep the summary under 200 words. Focus on decisions, key information, and next steps.`,
      userMessage: conversation,
      jsonMode: true,
      temperature: 0.3,
      maxTokens: 500,
    });
  } catch {
    return {
      summary: 'Unable to generate summary at this time.',
      keyTopics: [],
      participantCount: participants.size,
      messageCount: messages.length,
    };
  }

  try {
    const parsed = JSON.parse(result.content) as { summary: string; keyTopics: string[] };
    return {
      summary: parsed.summary || 'No summary available.',
      keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics : [],
      participantCount: participants.size,
      messageCount: messages.length,
    };
  } catch {
    return {
      summary: result.content.slice(0, 500),
      keyTopics: [],
      participantCount: participants.size,
      messageCount: messages.length,
    };
  }
}

export async function detectActionItems(
  channelId: string,
  messageCount: number = 30,
): Promise<DoraActionItemsResult> {
  const messages = await fetchRecentMessages(channelId, messageCount);
  if (messages.length === 0) {
    return { actionItems: [], confidence: 0 };
  }

  const conversation = formatConversation(messages);

  let result: LLMGatewayResult;
  try {
    result = await generateResponse({
      tier: LLM_TIER.FAST,
      systemPrompt: `You are Dora, an AI assistant for Messign Workspace. Analyze the chat conversation and extract action items, tasks, to-dos, and commitments. Return JSON: { "actionItems": [{ "text": "description", "assignee": "person name or null", "priority": "low|medium|high" }], "confidence": 0.0-1.0 }. Only include clear action items, not vague statements. If no action items are found, return an empty array.`,
      userMessage: conversation,
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 800,
    });
  } catch {
    return { actionItems: [], confidence: 0 };
  }

  try {
    const parsed = JSON.parse(result.content) as {
      actionItems: Array<{ text: string; assignee?: string; priority?: string }>;
      confidence: number;
    };
    const items: ActionItem[] = (parsed.actionItems ?? []).map((item, idx) => ({
      text: item.text,
      assignee: item.assignee ?? undefined,
      priority: (['low', 'medium', 'high'].includes(item.priority ?? '') ? item.priority : 'medium') as ActionItem['priority'],
      sourceMessageId: messages[Math.min(idx, messages.length - 1)]?.id ?? '',
    }));
    return { actionItems: items, confidence: parsed.confidence ?? 0.5 };
  } catch {
    return { actionItems: [], confidence: 0 };
  }
}

export async function getKBSuggestions(
  channelId: string,
  questionText: string,
): Promise<DoraKBSuggestionsResult> {
  const suggestions: KBSuggestion[] = [];

  try {
    const searchResult = await query<{
      id: string;
      title: string;
      content: string;
    }>(
      `SELECT id, title, SUBSTRING(content, 1, 200) AS content
       FROM knowledge_documents
       WHERE content_tsv @@ plainto_tsquery('english', $1)
       ORDER BY ts_rank(content_tsv, plainto_tsquery('english', $1)) DESC
       LIMIT 5`,
      [questionText],
    );

    for (const doc of searchResult.rows) {
      suggestions.push({
        title: doc.title,
        excerpt: doc.content,
        documentId: doc.id,
        relevanceScore: 0.8,
      });
    }
  } catch {
    // knowledge_documents table may not exist or have content_tsv; fallback to ILIKE
    try {
      const fallback = await query<{ id: string; title: string; content: string }>(
        `SELECT id, title, SUBSTRING(content, 1, 200) AS content
         FROM knowledge_documents
         WHERE title ILIKE $1 OR content ILIKE $1
         ORDER BY updated_at DESC
         LIMIT 5`,
        [`%${questionText.slice(0, 100)}%`],
      );
      for (const doc of fallback.rows) {
        suggestions.push({
          title: doc.title,
          excerpt: doc.content,
          documentId: doc.id,
          relevanceScore: 0.5,
        });
      }
    } catch {
      // Table doesn't exist or query failed
    }
  }

  return { suggestions, query: questionText };
}

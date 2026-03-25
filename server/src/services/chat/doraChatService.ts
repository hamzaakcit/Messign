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

export interface DoraDecisionsResult {
  decisions: Array<{ text: string; owners?: string[] }>;
  confidence: number;
}

export type DoraTransformAction =
  | 'explain'
  | 'shorten'
  | 'expand'
  | 'professional'
  | 'friendly'
  | 'translate';

const MAX_THREAD_MESSAGES = 80;
const MAX_CONTEXT_MESSAGES = 5;
const MAX_DRAFT_CHARS = 8000;
const MAX_MESSAGE_CHARS = 8000;

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

/**
 * Parent message plus thread replies (same channel), chronological order.
 */
export async function fetchThreadMessagesForDora(
  channelId: string,
  parentMessageId: string,
  limit: number = MAX_THREAD_MESSAGES,
): Promise<ChatMessage[]> {
  const cap = Math.min(Math.max(limit, 1), MAX_THREAD_MESSAGES);
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
       AND (m.id = $2 OR m.thread_id = $2)
     ORDER BY m.created_at ASC
     LIMIT $3`,
    [channelId, parentMessageId, cap],
  );
  return result.rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    content: r.content,
    senderName: r.sender_name ?? undefined,
    timestamp: r.created_at,
  }));
}

export async function summarizeThread(
  channelId: string,
  parentMessageId: string,
  messageCount: number = 50,
): Promise<DoraSummaryResult> {
  const messages = await fetchThreadMessagesForDora(channelId, parentMessageId, messageCount);
  if (messages.length === 0) {
    return { summary: 'No messages in this thread.', keyTopics: [], participantCount: 0, messageCount: 0 };
  }

  const conversation = formatConversation(messages);
  const participants = new Set(messages.map((m) => m.userId));

  let result: LLMGatewayResult;
  try {
    result = await generateResponse({
      tier: LLM_TIER.FAST,
      systemPrompt: `You are Dora, an AI assistant for Messign Workspace. Summarize this Slack-style thread (parent message and replies) concisely. Return JSON: { "summary": "...", "keyTopics": ["topic1", "topic2"] }. Under 200 words. Focus on decisions, open questions, and next steps.`,
      userMessage: conversation,
      jsonMode: true,
      temperature: 0.3,
      maxTokens: 500,
    });
  } catch {
    return {
      summary: 'Unable to generate thread summary at this time.',
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

export async function detectThreadActionItems(
  channelId: string,
  parentMessageId: string,
  messageCount: number = 40,
): Promise<DoraActionItemsResult> {
  const messages = await fetchThreadMessagesForDora(channelId, parentMessageId, messageCount);
  if (messages.length === 0) {
    return { actionItems: [], confidence: 0 };
  }

  const conversation = formatConversation(messages);

  let result: LLMGatewayResult;
  try {
    result = await generateResponse({
      tier: LLM_TIER.FAST,
      systemPrompt: `You are Dora, an AI assistant for Messign Workspace. Extract action items from this thread only. Return JSON: { "actionItems": [{ "text": "description", "assignee": "person name or null", "priority": "low|medium|high" }], "confidence": 0.0-1.0 }.`,
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

export async function extractDecisions(
  channelId: string,
  messageCount: number = 40,
): Promise<DoraDecisionsResult> {
  const messages = await fetchRecentMessages(channelId, messageCount);
  if (messages.length === 0) {
    return { decisions: [], confidence: 0 };
  }

  const conversation = formatConversation(messages);

  let result: LLMGatewayResult;
  try {
    result = await generateResponse({
      tier: LLM_TIER.FAST,
      systemPrompt: `You are Dora, an AI assistant for Messign Workspace. From the conversation, extract explicit decisions, commitments, and agreements only (not general discussion). Return JSON: { "decisions": [{ "text": "what was decided", "owners": ["name or empty"] }], "confidence": 0.0-1.0 }. Use empty array if none.`,
      userMessage: conversation,
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 800,
    });
  } catch {
    return { decisions: [], confidence: 0 };
  }

  try {
    const parsed = JSON.parse(result.content) as {
      decisions: Array<{ text: string; owners?: string[] }>;
      confidence: number;
    };
    const decisions = (parsed.decisions ?? []).map((d) => ({
      text: d.text,
      owners: Array.isArray(d.owners) ? d.owners.filter(Boolean) : undefined,
    }));
    return { decisions, confidence: parsed.confidence ?? 0.5 };
  } catch {
    return { decisions: [], confidence: 0 };
  }
}

/**
 * Decisions / commitments scoped to a single thread (parent + replies).
 */
export async function extractDecisionsThread(
  channelId: string,
  parentMessageId: string,
  messageCount: number = 40,
): Promise<DoraDecisionsResult> {
  const messages = await fetchThreadMessagesForDora(channelId, parentMessageId, messageCount);
  if (messages.length === 0) {
    return { decisions: [], confidence: 0 };
  }

  const conversation = formatConversation(messages);

  let result: LLMGatewayResult;
  try {
    result = await generateResponse({
      tier: LLM_TIER.FAST,
      systemPrompt: `You are Dora, an AI assistant for Messign Workspace. From this thread only (parent message and replies), extract explicit decisions, commitments, and agreements. Return JSON: { "decisions": [{ "text": "what was decided", "owners": ["name or empty"] }], "confidence": 0.0-1.0 }. Use empty array if none.`,
      userMessage: conversation,
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 800,
    });
  } catch {
    return { decisions: [], confidence: 0 };
  }

  try {
    const parsed = JSON.parse(result.content) as {
      decisions: Array<{ text: string; owners?: string[] }>;
      confidence: number;
    };
    const decisions = (parsed.decisions ?? []).map((d) => ({
      text: d.text,
      owners: Array.isArray(d.owners) ? d.owners.filter(Boolean) : undefined,
    }));
    return { decisions, confidence: parsed.confidence ?? 0.5 };
  } catch {
    return { decisions: [], confidence: 0 };
  }
}

export interface MessageTransformResult {
  text: string;
}

async function loadMessageWithContext(
  channelId: string,
  messageId: string,
): Promise<{ target: ChatMessage; contextBefore: ChatMessage[] } | null> {
  const row = await query<{
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
     WHERE m.id = $1 AND m.channel_id = $2 AND m.is_deleted = FALSE`,
    [messageId, channelId],
  );
  if (row.rows.length === 0) return null;

  const t = row.rows[0];
  const target: ChatMessage = {
    id: t.id,
    userId: t.user_id,
    content: t.content.slice(0, MAX_MESSAGE_CHARS),
    senderName: t.sender_name ?? undefined,
    timestamp: t.created_at,
  };

  const before = await query<{
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
     WHERE m.channel_id = $1 AND m.is_deleted = FALSE AND m.created_at < $2
     ORDER BY m.created_at DESC
     LIMIT $3`,
    [channelId, t.created_at, MAX_CONTEXT_MESSAGES],
  );

  const contextBefore = before.rows
    .reverse()
    .map((r) => ({
      id: r.id,
      userId: r.user_id,
      content: r.content,
      senderName: r.sender_name ?? undefined,
      timestamp: r.created_at,
    }));

  return { target, contextBefore };
}

function actionPrompt(action: DoraTransformAction, targetLocale?: string): string {
  const loc = targetLocale?.trim() || 'the user\'s language';
  switch (action) {
    case 'explain':
      return 'Explain the message clearly for someone who missed context. Return JSON: { "text": "..." }.';
    case 'shorten':
      return 'Shorten the message while keeping meaning. Return JSON: { "text": "..." }.';
    case 'expand':
      return 'Expand with helpful detail (still concise). Return JSON: { "text": "..." }.';
    case 'professional':
      return 'Rewrite in a professional workplace tone. Return JSON: { "text": "..." }.';
    case 'friendly':
      return 'Rewrite in a warm, friendly tone. Return JSON: { "text": "..." }.';
    case 'translate':
      return `Translate the message to ${loc}. Return JSON: { "text": "..." }.`;
    default:
      return 'Return JSON: { "text": "..." }.';
  }
}

export async function transformMessage(
  channelId: string,
  messageId: string,
  action: DoraTransformAction,
  targetLocale?: string,
): Promise<MessageTransformResult | null> {
  const loaded = await loadMessageWithContext(channelId, messageId);
  if (!loaded) return null;

  const { target, contextBefore } = loaded;
  const ctx = [...contextBefore, target]
    .map((m) => `[${m.senderName ?? m.userId}]: ${m.content}`)
    .join('\n');

  let result: LLMGatewayResult;
  try {
    result = await generateResponse({
      tier: LLM_TIER.FAST,
      systemPrompt: `You are Dora. ${actionPrompt(action, targetLocale)} The focus message is the last line.`,
      userMessage: ctx,
      jsonMode: true,
      temperature: action === 'translate' ? 0.2 : 0.4,
      maxTokens: 600,
    });
  } catch {
    return { text: '' };
  }

  try {
    const parsed = JSON.parse(result.content) as { text?: string };
    return { text: (parsed.text ?? result.content).slice(0, MAX_DRAFT_CHARS) };
  } catch {
    return { text: result.content.slice(0, MAX_DRAFT_CHARS) };
  }
}

export async function transformDraft(
  text: string,
  action: DoraTransformAction,
  targetLocale?: string,
): Promise<MessageTransformResult> {
  const trimmed = text.slice(0, MAX_DRAFT_CHARS);
  if (!trimmed.trim()) {
    return { text: '' };
  }

  let result: LLMGatewayResult;
  try {
    result = await generateResponse({
      tier: LLM_TIER.FAST,
      systemPrompt: `You are Dora. ${actionPrompt(action, targetLocale)} Apply only to the user's draft below.`,
      userMessage: trimmed,
      jsonMode: true,
      temperature: 0.4,
      maxTokens: 600,
    });
  } catch {
    return { text: '' };
  }

  try {
    const parsed = JSON.parse(result.content) as { text?: string };
    return { text: (parsed.text ?? result.content).slice(0, MAX_DRAFT_CHARS) };
  } catch {
    return { text: result.content.slice(0, MAX_DRAFT_CHARS) };
  }
}

export { MAX_DRAFT_CHARS, MAX_MESSAGE_CHARS };

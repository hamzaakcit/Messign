import { awardXP, XP_REWARDS } from '../gamification.js';
import { eventBus } from '../../events/index.js';
import { emitToUser } from '../../sockets/index.js';

export const CHAT_XP_REWARDS = {
  question_answered: 15,
  blocker_resolved: 25,
  task_created_from_chat: 10,
  helpful_link_shared: 5,
  thread_started: 3,
  message_sent: XP_REWARDS.message_sent,
} as const;

export type ChatXPEvent =
  | 'chat.question.answered'
  | 'chat.blocker.resolved'
  | 'chat.task.created_from_chat'
  | 'chat.helpful_link_shared'
  | 'chat.dora.transform_used';

export async function awardChatXP(
  userId: string,
  event: ChatXPEvent,
  context?: { channelId?: string; messageId?: string },
): Promise<{ amount: number; total: number } | null> {
  const rewardMap: Record<ChatXPEvent, number> = {
    'chat.question.answered': CHAT_XP_REWARDS.question_answered,
    'chat.blocker.resolved': CHAT_XP_REWARDS.blocker_resolved,
    'chat.task.created_from_chat': CHAT_XP_REWARDS.task_created_from_chat,
    'chat.helpful_link_shared': CHAT_XP_REWARDS.helpful_link_shared,
    'chat.dora.transform_used': 3,
  };

  const amount = rewardMap[event] ?? 5;
  const result = await awardXP(userId, amount, event);
  if (!result) return null;

  const totalXP = result.user.xp;

  void emitToUser(userId, 'xp:gained', {
    amount,
    total: totalXP,
    reason: formatXPReason(event),
  });

  eventBus.emit('gamification.xp.awarded', {
    userId,
    amount,
    reason: event,
    source: 'chat-gamification',
  });

  return { amount, total: totalXP };
}

function formatXPReason(event: ChatXPEvent): string {
  switch (event) {
    case 'chat.question.answered':
      return 'Answered a question';
    case 'chat.blocker.resolved':
      return 'Resolved a blocker';
    case 'chat.task.created_from_chat':
      return 'Created task from chat';
    case 'chat.helpful_link_shared':
      return 'Shared a helpful link';
    case 'chat.dora.transform_used':
      return 'Used Dora on a message';
    default:
      return 'Chat activity';
  }
}

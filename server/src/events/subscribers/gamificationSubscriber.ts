import { eventBus } from '../eventBus.js';
import { crossModuleQueue } from '../../queue/index.js';

const XP_AMOUNT = 10;

export function register(): void {
  eventBus.on('project.task.completed', async (payload) => {
    await crossModuleQueue.add('award_xp', {
      type: 'award_xp',
      payload: { userId: payload.completedBy, amount: payload.xpAwarded ?? XP_AMOUNT, reason: 'project.task.completed' },
      sourceEvent: 'project.task.completed',
    });
  });

  eventBus.on('chat.message.sent', async (payload) => {
    await crossModuleQueue.add('award_xp', {
      type: 'award_xp',
      payload: { userId: payload.userId, amount: XP_AMOUNT, reason: 'chat.message.sent' },
      sourceEvent: 'chat.message.sent',
    });
  });

  eventBus.on('finance.expense.submitted', async (payload) => {
    await crossModuleQueue.add('award_xp', {
      type: 'award_xp',
      payload: { userId: payload.userId, amount: XP_AMOUNT, reason: 'finance.expense.submitted' },
      sourceEvent: 'finance.expense.submitted',
    });
  });

  eventBus.on('knowledge.document.published', async (payload) => {
    await crossModuleQueue.add('award_xp', {
      type: 'award_xp',
      payload: { userId: payload.authorId, amount: XP_AMOUNT, reason: 'knowledge.document.published' },
      sourceEvent: 'knowledge.document.published',
    });
  });

  console.log('[Subscriber] Gamification subscriber registered');
}

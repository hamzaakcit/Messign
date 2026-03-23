import { eventBus } from '../eventBus.js';
import { crossModuleQueue } from '../../queue/index.js';

const XP_AMOUNT = 10;

export function register(): void {
  eventBus.on('project.task.completed', async (payload) => {
    try {
      await crossModuleQueue.add('award_xp', {
        type: 'award_xp',
        payload: { userId: payload.completedBy, amount: payload.xpAwarded ?? XP_AMOUNT, reason: 'project.task.completed' },
        sourceEvent: 'project.task.completed',
      });
    } catch (err) {
      console.error('[GamificationSubscriber] project.task.completed handler error:', err);
    }
  });

  eventBus.on('chat.message.sent', async (payload) => {
    try {
      await crossModuleQueue.add('award_xp', {
        type: 'award_xp',
        payload: { userId: payload.userId, amount: XP_AMOUNT, reason: 'chat.message.sent' },
        sourceEvent: 'chat.message.sent',
      });
    } catch (err) {
      console.error('[GamificationSubscriber] chat.message.sent handler error:', err);
    }
  });

  eventBus.on('finance.expense.submitted', async (payload) => {
    try {
      await crossModuleQueue.add('award_xp', {
        type: 'award_xp',
        payload: { userId: payload.userId, amount: XP_AMOUNT, reason: 'finance.expense.submitted' },
        sourceEvent: 'finance.expense.submitted',
      });
    } catch (err) {
      console.error('[GamificationSubscriber] finance.expense.submitted handler error:', err);
    }
  });

  eventBus.on('knowledge.document.published', async (payload) => {
    try {
      await crossModuleQueue.add('award_xp', {
        type: 'award_xp',
        payload: { userId: payload.authorId, amount: XP_AMOUNT, reason: 'knowledge.document.published' },
        sourceEvent: 'knowledge.document.published',
      });
    } catch (err) {
      console.error('[GamificationSubscriber] knowledge.document.published handler error:', err);
    }
  });

  console.log('[Subscriber] Gamification subscriber registered');
}

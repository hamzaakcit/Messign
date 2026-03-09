import { eventBus } from '../eventBus.js';

export function register(): void {
  eventBus.on('project.task.completed', (payload) => {
    console.log(`[XP] Would award XP to ${payload.completedBy} for project.task.completed`);
  });

  eventBus.on('chat.message.sent', (payload) => {
    console.log(`[XP] Would award XP to ${payload.userId} for chat.message.sent`);
  });

  eventBus.on('finance.expense.submitted', (payload) => {
    console.log(`[XP] Would award XP to ${payload.userId} for finance.expense.submitted`);
  });

  eventBus.on('knowledge.document.published', (payload) => {
    console.log(`[XP] Would award XP to ${payload.authorId} for knowledge.document.published`);
  });

  console.log('[Subscriber] Gamification subscriber registered');
}

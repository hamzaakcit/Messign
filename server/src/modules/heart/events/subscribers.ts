import type { EventBus } from '../../../platform/eventBus.js';
import { doraInsightsQueue } from '../../../queue/index.js';
import { query } from '../../../db/index.js';

export function registerHeartEventHandlers(eventBus: EventBus): void {
  eventBus.on('chat.message.sent', async (payload) => {
    const content = payload.content ?? '';
    if (content.length <= 20) return;
    await doraInsightsQueue.add('analyze_sentiment', {
      type: 'analyze_sentiment',
      payload: { userId: payload.userId, text: content, source: 'chat' },
    });
  });

  eventBus.on('okr.check_in.submitted', async (payload) => {
    const noteRow = await query<{ note: string | null }>(
      'SELECT note FROM okr_check_ins WHERE id = $1::uuid LIMIT 1',
      [payload.checkInId],
    );
    const note = noteRow.rows[0]?.note ?? '';
    if (note.length <= 20) return;
    await doraInsightsQueue.add('analyze_sentiment', {
      type: 'analyze_sentiment',
      payload: { userId: payload.userId, text: note, source: 'checkin' },
    });
  });

  eventBus.on('heart.burnout.risk_detected', (payload) => {
    if (payload.riskLevel === 'high') {
      console.log('[Heart] High burnout risk detected for user', payload.userId, 'signals:', payload.signals);
    }
  });

  eventBus.on('heart.sentiment.analyzed', (payload) => {
    if (payload.shiftDetected && payload.score < 0) {
      eventBus.emit('heart.engagement.shift', {
        userId: payload.userId,
        direction: 'decreasing',
        magnitude: Math.abs(payload.score - payload.previousScore) * 100,
        period: 'recent',
      });
    }
  });

  eventBus.on('hr.employee.onboarded', async (payload) => {
    const userId = payload.userId;
    const milestones = ['day_1', 'week_1', 'day_30', 'day_60', 'day_90'] as const;
    for (const milestone of milestones) {
      await query(
        `INSERT INTO heart_onboarding_journey (user_id, milestone, status)
         VALUES ($1::uuid, $2, $3)
         ON CONFLICT (user_id, milestone) DO NOTHING`,
        [userId, milestone, milestone === 'day_1' ? 'triggered' : 'pending'],
      );
    }
    await query(
      `UPDATE heart_onboarding_journey SET triggered_at = NOW(), status = 'triggered'
       WHERE user_id = $1::uuid AND milestone = 'day_1'`,
      [userId],
    );
  });

  console.log('[Heart] Event handlers registered');
}

import { eventBus } from '../eventBus.js';
import { query } from '../../db/index.js';

async function recalculateAutoSourcedKRs(autoSourcePrefix: string): Promise<void> {
  try {
    const krs = await query(
      `SELECT kr.id, kr.goal_id, kr.target_value, kr.start_value, kr.current_value, kr.auto_source
       FROM okr_key_results kr
       WHERE kr.auto_source LIKE $1`,
      [`${autoSourcePrefix}%`],
    );

    for (const kr of krs.rows) {
      let newValue: number | null = null;

      switch (kr.auto_source) {
        case 'crm.deals.won_count': {
          const r = await query(`SELECT COUNT(*)::int as cnt FROM crm_deals WHERE status = 'won'`);
          newValue = r.rows[0]?.cnt ?? 0;
          break;
        }
        case 'crm.deals.won_value': {
          const r = await query(`SELECT COALESCE(SUM(amount), 0)::numeric as total FROM crm_deals WHERE status = 'won'`);
          newValue = Number(r.rows[0]?.total ?? 0);
          break;
        }
        case 'finance.revenue.total': {
          const r = await query(`SELECT COALESCE(SUM(total), 0)::numeric as total FROM finance_invoices WHERE status = 'paid'`);
          newValue = Number(r.rows[0]?.total ?? 0);
          break;
        }
        default:
          continue;
      }

      if (newValue === null) continue;

      const range = Number(kr.target_value) - Number(kr.start_value);
      const progress = range > 0
        ? Math.min(100, Math.max(0, ((newValue - Number(kr.start_value)) / range) * 100))
        : (newValue >= Number(kr.target_value) ? 100 : 0);

      await query(
        `UPDATE okr_key_results SET current_value = $1, progress = $2, updated_at = NOW() WHERE id = $3`,
        [newValue, progress, kr.id],
      );

      // Recalculate parent goal progress
      const goalKrs = await query('SELECT progress FROM okr_key_results WHERE goal_id = $1', [kr.goal_id]);
      const avg = goalKrs.rows.reduce((s: number, r: Record<string, unknown>) => s + Number(r.progress), 0 as number) / goalKrs.rows.length;
      await query(`UPDATE okr_goals SET progress = $1, updated_at = NOW() WHERE id = $2`, [avg, kr.goal_id]);
    }
  } catch (err) {
    console.error(`[OKR Subscriber] Error recalculating auto-sourced KRs for ${autoSourcePrefix}:`, err);
  }
}

export function register(): void {
  eventBus.on('crm.deal.won', async () => {
    await recalculateAutoSourcedKRs('crm.deals');
  });

  eventBus.on('project.task.completed', async () => {
    await recalculateAutoSourcedKRs('project.tasks');
  });

  eventBus.on('finance.invoice.paid', async () => {
    await recalculateAutoSourcedKRs('finance.revenue');
  });

  console.log('[Subscriber] OKR subscriber registered');
}

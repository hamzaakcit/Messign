import cron from 'node-cron';
import { runMarketingPublisherTick } from '../services/marketing/marketingPublisherService.js';

/**
 * The publisher cron stays off unless this is exactly `1`.
 * Unset, `0`, and any other value do not schedule sends.
 */
export function marketingPublisherEnabled(
  value: string | undefined = process.env.MARKETING_PUBLISHER_ENABLED,
): boolean {
  return value === '1';
}

/**
 * Runs every minute — claim due calendar rows and push to external adapters.
 * Stays off unless `MARKETING_PUBLISHER_ENABLED=1`.
 */
export function startMarketingPublisherCron(): void {
  if (!marketingPublisherEnabled()) {
    console.log('[MarketingPublisherCron] Off (set MARKETING_PUBLISHER_ENABLED=1 to schedule)');
    return;
  }

  cron.schedule(
    '* * * * *',
    () => {
      void runMarketingPublisherTick().catch((err: unknown) => {
        console.error('[MarketingPublisherCron] tick error:', err instanceof Error ? err.message : err);
      });
    },
    { timezone: process.env.MARKETING_PUBLISHER_TZ || 'UTC' },
  );

  console.log('[MarketingPublisherCron] Scheduled every minute (UTC unless MARKETING_PUBLISHER_TZ set)');
}

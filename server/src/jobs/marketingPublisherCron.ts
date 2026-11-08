import cron from 'node-cron';
import { runMarketingPublisherTick } from '../services/marketing/marketingPublisherService.js';

/**
 * Runs every minute — claim due calendar rows and push to external adapters.
 * Default OFF (ADR-004); enable with `MARKETING_PUBLISHER_ENABLED=1`.
 */
export function startMarketingPublisherCron(): void {
  if (process.env.MARKETING_PUBLISHER_ENABLED !== '1') {
    console.log('[MarketingPublisherCron] Disabled by default — set MARKETING_PUBLISHER_ENABLED=1 to enable');
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

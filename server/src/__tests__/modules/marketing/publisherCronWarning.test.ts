import { afterEach, describe, expect, it, vi } from 'vitest';

const schedule = vi.fn();
vi.mock('node-cron', () => ({ default: { schedule: (...a: unknown[]) => schedule(...a) } }));
vi.mock('../../../services/marketing/marketingPublisherService.js', () => ({ runMarketingPublisherTick: vi.fn() }));
const { startMarketingPublisherCron } = await import('../../../jobs/marketingPublisherCron.js');

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); schedule.mockReset(); });

describe('startMarketingPublisherCron', () => {
  it('does nothing unless MARKETING_PUBLISHER_ENABLED=1', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const v of [undefined, '', '0', 'true']) {
      vi.stubEnv('MARKETING_PUBLISHER_ENABLED', v as string);
      startMarketingPublisherCron();
    }
    expect(schedule).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
  it('schedules and warns loudly when enabled but SEND_MODE is not live', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const mode of [undefined, 'off', 'sandbox']) {
      vi.stubEnv('MARKETING_PUBLISHER_ENABLED', '1');
      vi.stubEnv('SEND_MODE', mode as string);
      warn.mockClear();
      startMarketingPublisherCron();
      expect(warn.mock.calls[0]?.[0], String(mode)).toContain('marked published without being sent');
    }
    expect(schedule).toHaveBeenCalledTimes(3);
  });
  it('does not warn when SEND_MODE is live', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubEnv('MARKETING_PUBLISHER_ENABLED', '1');
    vi.stubEnv('SEND_MODE', 'live');
    startMarketingPublisherCron();
    expect(warn).not.toHaveBeenCalled();
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});

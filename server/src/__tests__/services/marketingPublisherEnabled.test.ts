import { marketingPublisherEnabled } from '../../jobs/marketingPublisherCron.js';

describe('marketingPublisherEnabled', () => {
  it('stays off unless the flag is exactly 1', () => {
    expect(marketingPublisherEnabled(undefined)).toBe(false);
    expect(marketingPublisherEnabled('')).toBe(false);
    expect(marketingPublisherEnabled('0')).toBe(false);
    expect(marketingPublisherEnabled('true')).toBe(false);
    expect(marketingPublisherEnabled('1')).toBe(true);
  });
});

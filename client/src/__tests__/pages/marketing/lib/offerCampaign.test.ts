import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findCampaign, resolveCampaignId, usedCampaigns } from '@/pages/marketing/lib/offerCampaign';

const createCampaign = vi.fn();
vi.mock('@/lib/marketingApi', () => ({
  marketingAPI: { createCampaign: (...args: unknown[]) => createCampaign(...args) },
}));

const spring = { id: 'c-spring', name: 'Spring Sale' };

describe('findCampaign', () => {
  it('matches a name ignoring case and extra spaces', () => {
    expect(findCampaign([spring], '  spring   sale ')).toEqual(spring);
    expect(findCampaign([spring], 'Summer')).toBeNull();
    expect(findCampaign([spring], '   ')).toBeNull();
  });
});

describe('resolveCampaignId', () => {
  beforeEach(() => {
    createCampaign.mockReset();
    createCampaign.mockResolvedValue({ id: 'c-new' });
  });

  it('is no campaign for an empty name, and calls nothing', async () => {
    await expect(resolveCampaignId('u1', '  ', [spring])).resolves.toBeNull();
    expect(createCampaign).not.toHaveBeenCalled();
  });

  it('joins the campaign that already has this name', async () => {
    await expect(resolveCampaignId('u1', 'spring sale', [spring])).resolves.toBe('c-spring');
    expect(createCampaign).not.toHaveBeenCalled();
  });

  it('makes a campaign with only a name when there is none, so there is no create-campaign form', async () => {
    await expect(resolveCampaignId('u1', '  Teachers Day ', [spring])).resolves.toBe('c-new');
    expect(createCampaign).toHaveBeenCalledWith('u1', { name: 'Teachers Day', channel: 'other' });
  });
});

describe('usedCampaigns', () => {
  it('lists each campaign once, by name, for the offers that belong to one', () => {
    const rows = [
      { campaign_id: 'b', campaign_name: 'Beta' },
      { campaign_id: 'a', campaign_name: 'Alpha' },
      { campaign_id: 'b', campaign_name: 'Beta' },
      { campaign_id: null, campaign_name: null },
    ];
    expect(usedCampaigns(rows)).toEqual([{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }]);
  });
});

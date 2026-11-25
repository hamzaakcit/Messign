/**
 * A campaign is a name on a set of offers (MC-12). There is no create-campaign form: typing a name on an offer
 * joins the campaign with that name, and makes it when there is none. The campaign is a plain name: no budget,
 * dates or channel mix. (The `other` channel is only what the campaigns table needs.)
 */

import { marketingAPI, type Campaign } from '@/lib/marketingApi';

export type CampaignName = Pick<Campaign, 'id' | 'name'>;

const key = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** The campaign with this name, ignoring case and extra spaces. */
export function findCampaign(campaigns: readonly CampaignName[], name: string): CampaignName | null {
  const wanted = key(name);
  if (!wanted) return null;
  return campaigns.find((c) => key(c.name) === wanted) ?? null;
}

/**
 * The campaign id for a typed name: null for an empty name (no campaign), the existing campaign when the name
 * matches one, otherwise a new campaign with that name.
 */
export async function resolveCampaignId(
  userId: string,
  name: string,
  campaigns: readonly CampaignName[],
): Promise<string | null> {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!clean) return null;
  const existing = findCampaign(campaigns, clean);
  if (existing) return existing.id;
  const created = await marketingAPI.createCampaign(userId, { name: clean, channel: 'other' });
  return created.id;
}

/** Campaigns that at least one offer in the list belongs to, by name. */
export function usedCampaigns(offers: ReadonlyArray<{ campaign_id?: string | null; campaign_name?: string | null }>): CampaignName[] {
  const byId = new Map<string, string>();
  for (const offer of offers) {
    if (offer.campaign_id && offer.campaign_name) byId.set(offer.campaign_id, offer.campaign_name);
  }
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

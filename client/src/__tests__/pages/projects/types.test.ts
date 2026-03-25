import { describe, it, expect } from 'vitest';
import type { MarketplaceProject } from '@/lib/api';
import {
  getDistinctRecruitmentDepts,
  matchesXpRange,
  matchesTimeCommitment,
  matchesMarketplaceStatus,
} from '@/pages/projects/types';

describe('projects/types filters', () => {
  it('getDistinctRecruitmentDepts returns unique departments', () => {
    const p = {
      recruitment_config: [
        { dept: 'engineering', count: 1, filled: 0 },
        { dept: 'design', count: 1, filled: 0 },
        { dept: 'engineering', count: 1, filled: 0 },
      ],
    } as unknown as MarketplaceProject;
    expect(getDistinctRecruitmentDepts(p).sort()).toEqual(['design', 'engineering']);
  });

  it('matchesXpRange respects buckets', () => {
    expect(matchesXpRange(50, '0-100')).toBe(true);
    expect(matchesXpRange(150, '100-250')).toBe(true);
    expect(matchesXpRange(600, '500+')).toBe(true);
  });

  it('matchesTimeCommitment passes when minutes unknown', () => {
    expect(matchesTimeCommitment(null, 'low')).toBe(true);
  });

  it('matchesMarketplaceStatus hot uses is_featured', () => {
    const p = { is_featured: true, recruitment_status: 'recruiting', xp_reward: 0 } as unknown as MarketplaceProject;
    expect(matchesMarketplaceStatus(p, 'hot')).toBe(true);
  });
});

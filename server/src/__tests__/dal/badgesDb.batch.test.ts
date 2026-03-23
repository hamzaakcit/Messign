import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/index.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../db/index.js';
import { getBadgesForUsers } from '../../db/badgesDb.js';

const queryMock = vi.mocked(query);

function mockQr<T extends Record<string, unknown>>(rows: T[]): Awaited<ReturnType<typeof query>> {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as Awaited<ReturnType<typeof query>>;
}

describe('getBadgesForUsers', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('returns empty map when userIds is empty without querying', async () => {
    const m = await getBadgesForUsers([]);
    expect(m.size).toBe(0);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('groups badges by user_id and sets holders to empty for list shape', async () => {
    queryMock.mockResolvedValueOnce(
      mockQr([
        {
          user_id: '11111111-1111-1111-1111-111111111111',
          id: 'b1',
          name: 'First',
          icon: 'star',
          type: 'achievement',
          description: 'd',
          rarity: 'common',
          criteria: null,
        },
        {
          user_id: '11111111-1111-1111-1111-111111111111',
          id: 'b2',
          name: 'Second',
          icon: 'bolt',
          type: 'skill',
          description: 'd2',
          rarity: 'rare',
          criteria: 'c',
        },
        {
          user_id: '22222222-2222-2222-2222-222222222222',
          id: 'b3',
          name: 'Other',
          icon: 'heart',
          type: 'achievement',
          description: 'd3',
          rarity: 'legendary',
          criteria: null,
        },
      ]),
    );

    const ids = [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ];
    const m = await getBadgesForUsers(ids);

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(m.get(ids[0])).toHaveLength(2);
    expect(m.get(ids[0])?.[0]?.holders).toEqual([]);
    expect(m.get(ids[0])?.[1]?.holders).toEqual([]);
    expect(m.get(ids[1])).toHaveLength(1);
    expect(m.get(ids[1])?.[0]?.criteria).toBeUndefined();
  });
});

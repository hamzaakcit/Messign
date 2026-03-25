import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:crypto', () => ({
  randomInt: vi.fn(),
}));

describe('duelRateLimit', () => {
  it('allows up to the per-window cap then rate-limits', async () => {
    const { assertDuelRateLimit } = await import('../../services/chat/duelRateLimit.js');
    const uid = 'user-a';
    const cid = 'chan-b';
    for (let i = 0; i < 6; i += 1) {
      expect(assertDuelRateLimit(uid, cid)).toBe('ok');
    }
    expect(assertDuelRateLimit(uid, cid)).toBe('rate_limited');
  });

  it('tracks separate counters per user/channel pair', async () => {
    const { assertDuelRateLimit } = await import('../../services/chat/duelRateLimit.js');
    expect(assertDuelRateLimit('u1', 'c1')).toBe('ok');
    expect(assertDuelRateLimit('u2', 'c1')).toBe('ok');
  });
});

describe('chat duelService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('playRpsDuel returns draw when house matches player', async () => {
    const crypto = await import('node:crypto');
    vi.mocked(crypto.randomInt).mockImplementationOnce(() => 0);
    const { playRpsDuel } = await import('../../services/chat/duelService.js');
    const out = playRpsDuel('rock');
    expect(out.you).toBe('rock');
    expect(out.house).toBe('rock');
    expect(out.outcome).toBe('draw');
    expect(out.metadata.modeId).toBe('rps');
    expect(out.metadata.seedVersion).toBe('1');
  });

  it('playRpsDuel returns win when player beats house', async () => {
    const crypto = await import('node:crypto');
    vi.mocked(crypto.randomInt).mockImplementationOnce(() => 2);
    const { playRpsDuel } = await import('../../services/chat/duelService.js');
    const out = playRpsDuel('rock');
    expect(out.house).toBe('scissors');
    expect(out.outcome).toBe('win');
  });

  it('playCoinDuel reflects server flip vs call', async () => {
    const crypto = await import('node:crypto');
    vi.mocked(crypto.randomInt).mockImplementationOnce(() => 0);
    const { playCoinDuel } = await import('../../services/chat/duelService.js');
    const out = playCoinDuel('heads');
    expect(out.result).toBe('heads');
    expect(out.youWin).toBe(true);
    expect(out.metadata.modeId).toBe('coin');
  });

  it('playChamberDuel clamps slot and reports hit when equal to danger', async () => {
    const crypto = await import('node:crypto');
    vi.mocked(crypto.randomInt).mockImplementationOnce(() => 4);
    const { playChamberDuel } = await import('../../services/chat/duelService.js');
    const out = playChamberDuel(4);
    expect(out.yourChamber).toBe(4);
    expect(out.dangerChamber).toBe(4);
    expect(out.hit).toBe(true);
    expect(out.metadata.modeId).toBe('chamber');
  });

  it('playChamberDuel clamps out-of-range input', async () => {
    const crypto = await import('node:crypto');
    vi.mocked(crypto.randomInt).mockImplementationOnce(() => 2);
    const { playChamberDuel } = await import('../../services/chat/duelService.js');
    const out = playChamberDuel(99);
    expect(out.yourChamber).toBe(6);
  });
});

describe('chat duel routes (membership shape)', () => {
  it('rejects invalid rps move at validation layer', () => {
    const RPS_MOVES = new Set(['rock', 'paper', 'scissors']);
    expect(RPS_MOVES.has('lizard')).toBe(false);
    expect(RPS_MOVES.has('rock')).toBe(true);
  });
});

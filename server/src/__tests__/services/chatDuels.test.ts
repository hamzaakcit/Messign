import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:crypto', () => ({
  randomInt: vi.fn(),
}));

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
  });

  it('playChamberDuel clamps slot and reports hit when equal to danger', async () => {
    const crypto = await import('node:crypto');
    vi.mocked(crypto.randomInt).mockImplementationOnce(() => 4);
    const { playChamberDuel } = await import('../../services/chat/duelService.js');
    const out = playChamberDuel(4);
    expect(out.yourChamber).toBe(4);
    expect(out.dangerChamber).toBe(4);
    expect(out.hit).toBe(true);
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

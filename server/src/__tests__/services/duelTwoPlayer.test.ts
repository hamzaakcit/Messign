import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashRpsCommitment,
  createTwoPlayerInvite,
  joinTwoPlayerInvite,
  revealTwoPlayerInvite,
  __resetTwoPlayerInvitesForTests,
} from '../../services/chat/duelTwoPlayerService.js';

describe('duelTwoPlayerService', () => {
  beforeEach(() => {
    __resetTwoPlayerInvitesForTests();
  });

  it('commitment round-trips for reveal', () => {
    const salt = 'my-salt-xyz';
    const move = 'rock' as const;
    const h = hashRpsCommitment(move, salt);
    expect(h).toHaveLength(64);
    const inv = createTwoPlayerInvite('chan-1', 'alice', h);
    if ('error' in inv) throw new Error(inv.error);
    const j = joinTwoPlayerInvite('chan-1', inv.inviteId, 'bob', 'scissors');
    if ('error' in j) throw new Error(j.error);
    const r = revealTwoPlayerInvite('chan-1', inv.inviteId, 'alice', move, salt);
    if ('error' in r) throw new Error(r.error);
    expect(r.challengerMove).toBe('rock');
    expect(r.opponentMove).toBe('scissors');
    expect(r.winnerUserId).toBe('alice');
  });

  it('rejects wrong reveal', () => {
    const salt = 's';
    const h = hashRpsCommitment('paper', salt);
    const inv = createTwoPlayerInvite('c1', 'u1', h);
    if ('error' in inv) throw new Error(inv.error);
    joinTwoPlayerInvite('c1', inv.inviteId, 'u2', 'rock');
    const r = revealTwoPlayerInvite('c1', inv.inviteId, 'u1', 'scissors', salt);
    expect('error' in r).toBe(true);
  });

  it('draw yields null winner', () => {
    const salt = 'salt2';
    const move = 'paper' as const;
    const h = hashRpsCommitment(move, salt);
    const inv = createTwoPlayerInvite('c2', 'a', h);
    if ('error' in inv) throw new Error(inv.error);
    joinTwoPlayerInvite('c2', inv.inviteId, 'b', 'paper');
    const r = revealTwoPlayerInvite('c2', inv.inviteId, 'a', move, salt);
    if ('error' in r) throw new Error(r.error);
    expect(r.winnerUserId).toBeNull();
  });
});

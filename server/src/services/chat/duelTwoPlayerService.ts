import { createHash, randomUUID } from 'node:crypto';
import type { RpsMove } from './duelService.js';
import { DUEL_SEED_VERSION } from './duelService.js';

const INVITE_TTL_MS = 15 * 60 * 1000;
const MAX_SALT_LEN = 512;
const HEX_COMMIT_LEN = 64;

function beats(a: RpsMove, b: RpsMove): boolean {
  return (
    (a === 'rock' && b === 'scissors') ||
    (a === 'paper' && b === 'rock') ||
    (a === 'scissors' && b === 'paper')
  );
}

/**
 * SHA-256 commitment for challenger move + salt (must match client `hashRpsCommitment`).
 */
export function hashRpsCommitment(move: RpsMove, salt: string): string {
  return createHash('sha256').update(`${move}:${salt}`, 'utf8').digest('hex');
}

type InviteStatus = 'awaiting_opponent' | 'awaiting_reveal';

interface StoredInvite {
  channelId: string;
  challengerId: string;
  commitmentHex: string;
  status: InviteStatus;
  opponentId?: string;
  opponentMove?: RpsMove;
  expiresAt: number;
}

const invites = new Map<string, StoredInvite>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, inv] of invites) {
    if (inv.expiresAt <= now) invites.delete(id);
  }
}

export interface RpsTwoPlayerDuelResult {
  inviteId: string;
  challengerId: string;
  opponentId: string;
  challengerMove: RpsMove;
  opponentMove: RpsMove;
  winnerUserId: string | null;
  headline: string;
  taskHint: string;
  metadata: { seedVersion: typeof DUEL_SEED_VERSION; modeId: 'rps_two_player' };
}

export interface CreateInviteResult {
  inviteId: string;
  expiresAt: string;
}

/**
 * Challenger posts a commitment (sha256 hex of `move:salt`) without revealing the move yet.
 */
export function createTwoPlayerInvite(
  channelId: string,
  challengerId: string,
  commitmentHex: string,
): CreateInviteResult | { error: string; status: number } {
  pruneExpired();
  if (!/^[a-f0-9]{64}$/i.test(commitmentHex)) {
    return { error: 'commitmentHex must be a 64-character hex SHA-256 of move:salt', status: 400 };
  }
  const inviteId = randomUUID();
  const expiresAt = Date.now() + INVITE_TTL_MS;
  invites.set(inviteId, {
    channelId,
    challengerId,
    commitmentHex: commitmentHex.toLowerCase(),
    status: 'awaiting_opponent',
    expiresAt,
  });
  return { inviteId, expiresAt: new Date(expiresAt).toISOString() };
}

export interface JoinResult {
  ok: true;
  status: 'awaiting_reveal';
  inviteId: string;
}

/**
 * Opponent joins with their move (visible to server after challenger committed).
 */
export function joinTwoPlayerInvite(
  channelId: string,
  inviteId: string,
  opponentId: string,
  move: RpsMove,
): JoinResult | { error: string; status: number } {
  pruneExpired();
  const inv = invites.get(inviteId);
  if (!inv) return { error: 'Invite not found or expired', status: 410 };
  if (inv.channelId !== channelId) return { error: 'Invite belongs to another channel', status: 400 };
  if (inv.expiresAt <= Date.now()) {
    invites.delete(inviteId);
    return { error: 'Invite expired', status: 410 };
  }
  if (inv.challengerId === opponentId) {
    return { error: 'You cannot join your own invite', status: 400 };
  }
  if (inv.status !== 'awaiting_opponent') {
    return { error: 'Invite is no longer open', status: 409 };
  }
  inv.opponentId = opponentId;
  inv.opponentMove = move;
  inv.status = 'awaiting_reveal';
  return { ok: true, status: 'awaiting_reveal', inviteId };
}

/**
 * Challenger reveals move + salt; server verifies hash and scores the duel.
 */
export function revealTwoPlayerInvite(
  channelId: string,
  inviteId: string,
  challengerId: string,
  move: RpsMove,
  salt: string,
): RpsTwoPlayerDuelResult | { error: string; status: number } {
  pruneExpired();
  const inv = invites.get(inviteId);
  if (!inv) return { error: 'Invite not found or expired', status: 410 };
  if (inv.channelId !== channelId) return { error: 'Invite belongs to another channel', status: 400 };
  if (inv.challengerId !== challengerId) {
    return { error: 'Only the challenger can reveal this invite', status: 403 };
  }
  if (inv.status !== 'awaiting_reveal' || !inv.opponentId || !inv.opponentMove) {
    return { error: 'Opponent has not joined yet', status: 409 };
  }
  if (inv.expiresAt <= Date.now()) {
    invites.delete(inviteId);
    return { error: 'Invite expired', status: 410 };
  }
  if (salt.length > MAX_SALT_LEN || salt.length === 0) {
    return { error: 'salt must be 1–512 characters', status: 400 };
  }
  const expected = hashRpsCommitment(move, salt);
  if (expected !== inv.commitmentHex) {
    return { error: 'Reveal does not match commitment', status: 400 };
  }

  const a = move;
  const b = inv.opponentMove;
  let winnerUserId: string | null = null;
  let headline: string;
  let taskHint: string;

  if (a === b) {
    winnerUserId = null;
    headline = 'Draw — neither side takes the chore this round.';
    taskHint = 'Optional: run it back or use solo vs house.';
  } else if (beats(a, b)) {
    winnerUserId = inv.challengerId;
    headline = 'Challenger wins the face-off!';
    taskHint = 'Create a task: “RPS duel — opponent owes a tiny favor.”';
  } else {
    winnerUserId = inv.opponentId;
    headline = 'Opponent wins the face-off!';
    taskHint = 'Create a task: “RPS duel — challenger owes a tiny favor.”';
  }

  const result: RpsTwoPlayerDuelResult = {
    inviteId,
    challengerId: inv.challengerId,
    opponentId: inv.opponentId,
    challengerMove: a,
    opponentMove: b,
    winnerUserId,
    headline,
    taskHint,
    metadata: { seedVersion: DUEL_SEED_VERSION, modeId: 'rps_two_player' },
  };

  invites.delete(inviteId);
  return result;
}

export function getTwoPlayerInviteStatus(inviteId: string):
  | { status: 'not_found' }
  | { status: 'awaiting_opponent'; expiresAt: string }
  | { status: 'awaiting_reveal'; expiresAt: string }
  | { status: 'expired' } {
  pruneExpired();
  const inv = invites.get(inviteId);
  if (!inv) return { status: 'not_found' };
  if (inv.expiresAt <= Date.now()) return { status: 'expired' };
  if (inv.status === 'awaiting_opponent') {
    return { status: 'awaiting_opponent', expiresAt: new Date(inv.expiresAt).toISOString() };
  }
  return { status: 'awaiting_reveal', expiresAt: new Date(inv.expiresAt).toISOString() };
}

/** Test helper: clear all invites. */
export function __resetTwoPlayerInvitesForTests(): void {
  invites.clear();
}

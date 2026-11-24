import { describe, it, expect } from 'vitest';
import { boardMove, refusedMoveMessage } from '@/pages/marketing/lib/boardMoves';

describe('boardMove', () => {
  it('submits a content draft for review', () => {
    expect(boardMove('draft', 'review', { type: 'content' })).toBe('submit_for_review');
  });

  it('approves an approval card from review to ready', () => {
    expect(boardMove('review', 'ready', { type: 'approval' })).toBe('approve');
  });

  it('refuses to publish by dragging to live', () => {
    expect(boardMove('ready', 'live', { type: 'content' })).toBeNull();
    expect(boardMove('draft', 'live', { type: 'content' })).toBeNull();
    expect(refusedMoveMessage('live')).toMatch(/calendar/);
  });

  it('refuses a plain content card from review to ready instead of doing nothing', () => {
    expect(boardMove('review', 'ready', { type: 'content' })).toBeNull();
    expect(refusedMoveMessage('ready')).toBe('This card can’t move there.');
  });
});

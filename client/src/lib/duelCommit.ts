import type { ChatRpsMove } from '@/types';

/**
 * SHA-256 commitment hex for `move:salt` — must match server `duelTwoPlayerService.hashRpsCommitment`.
 */
export async function hashRpsCommitment(move: ChatRpsMove, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${move}:${salt}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Random salt for commit–reveal (hex, 64 chars).
 */
export function generateDuelSalt(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

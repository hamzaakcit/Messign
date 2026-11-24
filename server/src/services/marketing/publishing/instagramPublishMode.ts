export type InstagramPublishMode = 'mock' | 'live';

/**
 * A legacy adapter may call its network only when `SEND_MODE` is exactly `live`.
 * Unset, off, sandbox, and any other value stay on the mock path.
 */
export function legacyNetworkSendAllowed(
  sendMode: string | undefined = process.env.SEND_MODE,
): boolean {
  return sendMode === 'live';
}

/**
 * Graph runs only when `SEND_MODE` is exactly `live`.
 * Unset, off, sandbox, and any other value stay on the mock permalink.
 */
export function instagramPublishMode(
  sendMode: string | undefined = process.env.SEND_MODE,
): InstagramPublishMode {
  return legacyNetworkSendAllowed(sendMode) ? 'live' : 'mock';
}

/**
 * Test publish is an Instagram control. Email stays on the journey screen and is not sent to a network.
 */
export function instagramTestPublishBlock(channel: string | null | undefined): string | null {
  const value = (channel ?? '').toLowerCase();
  if (value === 'email' || value === 'newsletter') {
    return 'Email is not published to a network.';
  }
  if (value !== 'instagram') {
    return 'Test publish is only for Instagram.';
  }
  return null;
}

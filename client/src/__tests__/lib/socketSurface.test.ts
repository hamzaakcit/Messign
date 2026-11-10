import { afterEach, describe, expect, it, vi } from 'vitest';

/** ADR-017: an engage session does not open the Company-OS socket (it carries presence, activity and chat broadcasts). */

const fake = vi.hoisted(() => ({ socket: { connected: false, auth: {} as unknown, connect: vi.fn(), emit: vi.fn(), disconnect: vi.fn(), on: vi.fn(), off: vi.fn() } }));
vi.mock('socket.io-client', () => ({ io: vi.fn(() => fake.socket) }));
// The global test setup stubs the socket helper; this file tests the real one.
vi.unmock('@/lib/socket');

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });

async function connectOn(surface: string): Promise<void> {
  vi.stubEnv('VITE_PRODUCT_SURFACE', surface);
  vi.resetModules();
  const { connectSocket } = await import('@/lib/socket');
  connectSocket('u1');
}

describe('connectSocket by surface', () => {
  it('connects on the workspace and shared builds', async () => {
    for (const surface of ['workspace', 'all']) {
      fake.socket.connect.mockClear();
      await connectOn(surface);
      expect(fake.socket.connect, surface).toHaveBeenCalledTimes(1);
    }
  });

  it('does not connect on the engage build', async () => {
    await connectOn('engage');
    expect(fake.socket.connect).not.toHaveBeenCalled();
    expect(fake.socket.emit).not.toHaveBeenCalled();
  });

  it('does not connect for a tenant session on a shared build', async () => {
    vi.stubEnv('VITE_PRODUCT_SURFACE', 'all');
    vi.resetModules();
    const { setSessionSurface } = await import('@/lib/productSurface');
    const { connectSocket } = await import('@/lib/socket');
    setSessionSurface('engage');
    connectSocket('u1');
    expect(fake.socket.connect).not.toHaveBeenCalled();
    setSessionSurface(null);
  });
});

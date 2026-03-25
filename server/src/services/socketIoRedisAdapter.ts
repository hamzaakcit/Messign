import IORedis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server } from 'socket.io';

let pubClient: IORedis | null = null;
let subClient: IORedis | null = null;

/**
 * Attaches the official Socket.IO Redis adapter so Engine.IO sessions and broadcasts work across
 * multiple Node processes (Railway replicas). Without this, WebSocket upgrade often fails or
 * connections drop when polling and WS hit different instances.
 */
export async function attachSocketIoRedisAdapter(io: Server): Promise<void> {
  if (process.env.SKIP_SOCKET_REDIS_ADAPTER === '1') {
    console.warn('[Socket.IO] Redis adapter skipped (SKIP_SOCKET_REDIS_ADAPTER=1)');
    return;
  }

  const url = process.env.REDIS_URL?.trim() || 'redis://localhost:6379';

  try {
    pubClient = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    subClient = pubClient.duplicate();
    await Promise.all([pubClient.ping(), subClient.ping()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.info('[Socket.IO] Redis adapter enabled (multi-instance + WebSocket)');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      '[Socket.IO] Redis adapter failed; falling back to in-memory adapter (single-instance only):',
      msg,
    );
    await safeQuitClients();
  }
}

async function safeQuitClients(): Promise<void> {
  await Promise.all([pubClient?.quit().catch(() => {}), subClient?.quit().catch(() => {})]);
  pubClient = null;
  subClient = null;
}

/** Call on shutdown after `io.close()` so pub/sub connections are released. */
export async function quitSocketIoRedisClients(): Promise<void> {
  await safeQuitClients();
}

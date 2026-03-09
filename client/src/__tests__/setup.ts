import '@testing-library/jest-dom';
import { vi } from 'vitest';

// ── Browser API stubs ──────────────────────────────────────────────────────
// jsdom doesn't implement these; many UI libraries (recharts, framer-motion)
// access them during render.

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
window.ResizeObserver = ResizeObserverStub;

class IntersectionObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
window.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;

// ── Network stubs ──────────────────────────────────────────────────────────
// Prevent any real HTTP calls in tests; all fetch calls resolve to {}
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => ({}),
  text: async () => '',
  headers: { get: () => 'application/json' },
} as unknown as Response);

// ── socket.io-client ───────────────────────────────────────────────────────
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connect: vi.fn(),
    connected: false,
  })),
}));

// ── Internal socket helper ─────────────────────────────────────────────────
vi.mock('@/lib/socket', () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
  getSocket: vi.fn(() => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn() })),
}));

/**
 * Platform EventBus — Abstract interface for domain event pub/sub
 *
 * Wraps mitt for now. Modules subscribe via registerEventHandlers(eventBus).
 * Allows swapping implementations (e.g. Redis pub/sub for multi-instance) later.
 */
import { eventBus as mittEventBus } from '../events/index.js';
import type { EventName, EventPayload } from '../events/eventTypes.js';

export interface EventBus {
  emit<T extends EventName>(event: T, payload: EventPayload<T>): void;
  on<T extends EventName>(event: T, handler: (payload: EventPayload<T>) => void): void;
  off<T extends EventName>(event: T, handler: (payload: EventPayload<T>) => void): void;
  onAny(handler: (event: EventName, payload: unknown) => void): void;
}

/** Concrete implementation (mitt-based). Use this for module registration. */
export const eventBus: EventBus = mittEventBus;

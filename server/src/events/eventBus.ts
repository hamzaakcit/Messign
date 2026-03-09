import mitt from 'mitt';
import type { EventName, EventPayload } from './eventTypes.js';

const emitter = mitt();

export const eventBus = {
  emit<T extends EventName>(event: T, payload: EventPayload<T>): void {
    console.log(`[EventBus] ${event}`, JSON.stringify(payload).substring(0, 200));
    emitter.emit(event, payload);
  },

  on<T extends EventName>(event: T, handler: (payload: EventPayload<T>) => void): void {
    emitter.on(event, handler as any);
  },

  off<T extends EventName>(event: T, handler: (payload: EventPayload<T>) => void): void {
    emitter.off(event, handler as any);
  },

  onAny(handler: (event: EventName, payload: any) => void): void {
    emitter.on('*', (type, payload) => handler(type as EventName, payload));
  },
};

export default eventBus;

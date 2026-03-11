import mitt from 'mitt';
import type { EventName, EventPayload } from './eventTypes.js';

const emitter = mitt();

function redactPayloadForLogs(payload: unknown): string {
  try {
    const raw = JSON.stringify(payload);
    const redacted = raw
      .replace(/"email"\s*:\s*"[^"]*"/gi, '"email":"[redacted]"')
      .replace(/"phone"\s*:\s*"[^"]*"/gi, '"phone":"[redacted]"')
      .replace(/"reason"\s*:\s*"[^"]{0,120}"/gi, '"reason":"[redacted]"');
    return redacted.substring(0, 200);
  } catch {
    return '[unserializable]';
  }
}

export const eventBus = {
  emit<T extends EventName>(event: T, payload: EventPayload<T>): void {
    console.log(`[EventBus] ${event}`, redactPayloadForLogs(payload));
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

import type { Response } from 'express';

/**
 * v2 SSE: each event is one line of JSON `{ type, data }` after `data: ` (SSE standard).
 *
 * Always ends with a `done` event so clients can finalize streaming UI. If a code path
 * forgot `emit('done')`, {@link end} still emits `done` once (idempotent).
 */
export class StreamController {
  private doneEmitted = false;

  constructor(private readonly res: Response) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }
  }

  emit(type: string, data: unknown): void {
    if (type === 'done') {
      this.doneEmitted = true;
    }
    let payload: string;
    try {
      payload = JSON.stringify({ type, data });
    } catch {
      payload = JSON.stringify({
        type: 'error',
        data: { code: 'sse_payload', message: 'Response payload could not be serialized.' },
      });
    }
    this.res.write(`data: ${payload}\n\n`);
  }

  end(): void {
    if (!this.doneEmitted) {
      this.doneEmitted = true;
      const payload = JSON.stringify({ type: 'done', data: null });
      this.res.write(`data: ${payload}\n\n`);
    }
    if (!this.res.writableEnded) {
      this.res.end();
    }
  }
}

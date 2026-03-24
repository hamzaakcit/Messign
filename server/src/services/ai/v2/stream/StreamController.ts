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
    if (this.res.writableEnded) return;
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
    try {
      this.res.write(`data: ${payload}\n\n`);
    } catch {
      /* client disconnected */
    }
  }

  end(): void {
    try {
      if (!this.doneEmitted && !this.res.writableEnded) {
        this.doneEmitted = true;
        this.res.write(`data: ${JSON.stringify({ type: 'done', data: null })}\n\n`);
      }
      if (!this.res.writableEnded) {
        this.res.end();
      }
    } catch {
      /* client already disconnected */
    }
  }
}

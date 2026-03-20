import type { Response } from 'express';

/**
 * v2 SSE: each event is one line of JSON `{ type, data }` after `data: ` (SSE standard).
 */
export class StreamController {
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
    const payload = JSON.stringify({ type, data });
    this.res.write(`data: ${payload}\n\n`);
  }

  end(): void {
    this.res.end();
  }
}

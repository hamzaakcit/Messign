import { Request, Response, NextFunction } from 'express';

/** Computed once at startup — no per-request env reads. */
const SLOW_MS = (() => {
  const n = Number(process.env.SLOW_LOG_MS);
  if (Number.isFinite(n) && n > 0) return n;
  return process.env.NODE_ENV === 'production' ? 500 : 2000;
})();

export function responseTimer(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const originalEnd = res.end;
  const slowMs = SLOW_MS;

  const wrappedEnd = function (...args: Parameters<Response['end']>) {
    const duration = Date.now() - start;
    if (duration > slowMs) {
      console.warn(`[SLOW] ${req.method} ${req.originalUrl}: ${duration}ms`);
    }
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`);
    }
    return (originalEnd as Function).apply(res, args);
  };
  (res as { end: typeof wrappedEnd }).end = wrappedEnd;

  next();
}

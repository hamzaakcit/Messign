import { Request, Response, NextFunction } from 'express';

export function responseTimer(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const originalEnd = res.end;

  const wrappedEnd = function (...args: Parameters<Response['end']>) {
    const duration = Date.now() - start;
    if (duration > 500) {
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

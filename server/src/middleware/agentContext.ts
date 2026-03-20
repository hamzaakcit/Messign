import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Ensures every agent request has a trace id (for logs + response header).
 */
export function agentTraceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get('x-trace-id')?.trim();
  const traceId =
    incoming && incoming.length <= 64 && /^[\w-]+$/.test(incoming) ? incoming : randomUUID();
  req.agentTraceId = traceId;
  res.setHeader('X-Trace-Id', traceId);
  next();
}

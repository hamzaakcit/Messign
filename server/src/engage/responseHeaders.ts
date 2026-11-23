import type { NextFunction, Request, Response } from 'express';

/**
 * Headers for every engage API response (WP-31). The engage API returns JSON (and a plain-text webhook challenge), never a
 * page, so it can say so strictly: nothing in a response may be rendered, framed or sniffed as something else. An
 * individual route may still set its own Cache-Control (most set no-store).
 */
export function engageResponseHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

import express, { type RequestHandler } from 'express';
import type { IncomingMessage } from 'http';

/**
 * The server's JSON body parser, with one exception: provider webhooks. A provider proves itself with a signature over the
 * exact bytes it sent (WP-12), so the webhook route reads the raw body itself, and a parser that runs first would consume
 * it. SES (through SNS) posts text/plain and was never touched; WhatsApp posts application/json (WP-27), so without this
 * every WhatsApp webhook would arrive parsed and be refused as unreadable. The exception is by path, so no other route
 * changes. One function, used by the server and by the test app, so the tests run with what production runs.
 */
export const ENGAGE_WEBHOOK_PATH = '/api/engage/webhooks/';

export function isJsonRequest(req: IncomingMessage): boolean {
  return String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json');
}

export function appJsonParser(): RequestHandler {
  return express.json({ limit: '1mb', type: (req) => isJsonRequest(req) && !(req.url ?? '').startsWith(ENGAGE_WEBHOOK_PATH) });
}

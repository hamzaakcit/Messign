import { redact, redactString } from './redact.js';

/** The only logger engage code uses. Everything passes through redaction first. */
type Fields = Record<string, unknown> | undefined;

function emit(level: 'info' | 'warn' | 'error', message: string, fields: Fields): void {
  const args: unknown[] = [`[engage] ${redactString(message)}`];
  if (fields !== undefined) args.push(redact(fields));
  console[level](...args);
}

export const logInfo = (message: string, fields?: Fields) => emit('info', message, fields);
export const logWarn = (message: string, fields?: Fields) => emit('warn', message, fields);
export const logError = (message: string, fields?: Fields) => emit('error', message, fields);

/**
 * One readable line for an error, never empty. Connection failures are often an AggregateError with an empty message
 * and the real information in `code` and a nested list of addresses (for example "ECONNREFUSED 10.0.0.5:5432").
 * Output is redacted, and carries no stack.
 */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return 'non-error thrown';
  const code = (err as { code?: unknown }).code;
  const nested = (err as { errors?: unknown }).errors;
  const parts: string[] = [err.name];
  if (err.message) parts.push(err.message);
  if (typeof code === 'string' && !err.message.includes(code)) parts.push(code);
  if (Array.isArray(nested) && nested.length > 0) {
    const items = nested.slice(0, 5).map((e) => {
      const x = e as { code?: unknown; address?: unknown; port?: unknown; message?: unknown };
      const where = x.address !== undefined ? ` ${String(x.address)}${x.port !== undefined ? `:${String(x.port)}` : ''}` : '';
      return `${typeof x.code === 'string' ? x.code : String(x.message ?? 'error')}${where}`;
    });
    parts.push(`[${items.join(', ')}${nested.length > 5 ? `, +${nested.length - 5} more` : ''}]`);
  }
  return redactString(parts.join(' '));
}

/** Logs an error by name and redacted description only, never the object or its stack. */
export function errorFields(err: unknown): Record<string, unknown> {
  return err instanceof Error ? { error: err.name, detail: describeError(err) } : { error: 'non-error thrown' };
}

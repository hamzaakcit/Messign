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

/** Logs an error by name and redacted message only, never the object or its stack. */
export function errorFields(err: unknown): Record<string, unknown> {
  return err instanceof Error ? { error: err.name, detail: redactString(err.message) } : { error: 'non-error thrown' };
}

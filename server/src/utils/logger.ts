// ─── Structured Logger ──────────────────────────────────────────────
// Zero-dependency, environment-aware logger with PII redaction.
// Usage:
//   import { createLogger } from '../utils/logger';
//   const log = createLogger('marketing');
//   log.info('Campaign created', { correlationId: req.id, campaignId: 42 });

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  correlationId?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error | unknown, context?: LogContext): void;
}

const LEVEL_SEVERITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let globalLevelOverride: LogLevel | undefined;

/** Override the minimum log level at runtime (affects all loggers). */
export function setGlobalLogLevel(level: LogLevel): void {
  globalLevelOverride = level;
}

function getMinLevel(): LogLevel {
  if (globalLevelOverride) return globalLevelOverride;

  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (envLevel && envLevel in LEVEL_SEVERITY) return envLevel;

  return isProduction() ? 'info' : 'debug';
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

// ─── PII Redaction ──────────────────────────────────────────────────

const PII_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  // Email addresses
  {
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    replacement: '[EMAIL_REDACTED]',
  },
  // US phone numbers: (555) 123-4567, 555-123-4567, 5551234567, +1-555-123-4567
  {
    regex: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: '[PHONE_REDACTED]',
  },
  // SSN: 123-45-6789 or 123 45 6789
  {
    regex: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    replacement: '[SSN_REDACTED]',
  },
];

function redact(value: string): string {
  let result = value;
  for (const { regex, replacement } of PII_PATTERNS) {
    // Reset lastIndex since we reuse global regexes
    regex.lastIndex = 0;
    result = result.replace(regex, replacement);
  }
  return result;
}

function redactContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ctx)) {
    if (typeof value === 'string') {
      cleaned[key] = redact(value);
    } else if (value instanceof Error) {
      cleaned[key] = { message: redact(value.message), stack: value.stack };
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

// ─── Formatting ─────────────────────────────────────────────────────

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
} as const;

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: ANSI.dim,
  info: ANSI.green,
  warn: ANSI.yellow,
  error: ANSI.red,
};

function isoTimestamp(): string {
  return new Date().toISOString();
}

function formatJson(
  level: LogLevel,
  namespace: string,
  message: string,
  context?: Record<string, unknown>,
): string {
  const entry: Record<string, unknown> = {
    timestamp: isoTimestamp(),
    level,
    namespace,
    message: redact(message),
    ...(context ? redactContext(context) : {}),
  };
  return JSON.stringify(entry);
}

function formatPretty(
  level: LogLevel,
  namespace: string,
  message: string,
  context?: Record<string, unknown>,
): string {
  const ts = `${ANSI.dim}${isoTimestamp()}${ANSI.reset}`;
  const lvl = `${LEVEL_COLOR[level]}${ANSI.bold}${level.toUpperCase().padEnd(5)}${ANSI.reset}`;
  const ns = `${ANSI.cyan}[${namespace}]${ANSI.reset}`;
  const msg = redact(message);

  let line = `${ts} ${lvl} ${ns} ${msg}`;

  if (context && Object.keys(context).length > 0) {
    const cleaned = redactContext(context);
    const pretty = JSON.stringify(cleaned, null, 2)
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n');
    line += `\n${ANSI.dim}${pretty}${ANSI.reset}`;
  }

  return line;
}

// ─── Logger Factory ─────────────────────────────────────────────────

function extractErrorInfo(
  err: Error | unknown,
): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      errorName: err.name,
      errorMessage: redact(err.message),
      stack: err.stack,
    };
  }
  return { errorDetail: String(err) };
}

/**
 * Creates a namespaced logger instance.
 *
 * @param namespace - Tag included in every log line, e.g. `'requireAuth'`, `'marketing'`.
 */
export function createLogger(namespace: string): Logger {
  const emit = (
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void => {
    if (LEVEL_SEVERITY[level] < LEVEL_SEVERITY[getMinLevel()]) return;

    const formatted = isProduction()
      ? formatJson(level, namespace, message, context)
      : formatPretty(level, namespace, message, context);

    switch (level) {
      case 'error':
        console.error(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'debug':
        console.debug(formatted);
        break;
      default:
        console.log(formatted);
    }
  };

  return {
    debug(message: string, context?: LogContext): void {
      emit('debug', message, context);
    },

    info(message: string, context?: LogContext): void {
      emit('info', message, context);
    },

    warn(message: string, context?: LogContext): void {
      emit('warn', message, context);
    },

    error(message: string, errorOrCtx?: Error | unknown, context?: LogContext): void {
      if (errorOrCtx instanceof Error) {
        const merged = { ...extractErrorInfo(errorOrCtx), ...context };
        emit('error', message, merged);
      } else if (
        errorOrCtx !== undefined &&
        typeof errorOrCtx === 'object' &&
        errorOrCtx !== null &&
        !(errorOrCtx instanceof Error)
      ) {
        // Caller passed context as second arg (no Error)
        emit('error', message, errorOrCtx as LogContext);
      } else if (errorOrCtx !== undefined) {
        emit('error', message, { errorDetail: String(errorOrCtx), ...context });
      } else {
        emit('error', message, context);
      }
    },
  };
}

import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Standard application error with HTTP status code.
 * Throw from any route handler — the global error handler will
 * serialize it as `{ success: false, error: { code, message } }`.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = 'APP_ERROR',
  ) {
    super(message);
    this.name = 'AppError';
  }

  static badRequest(message: string, code = 'BAD_REQUEST'): AppError {
    return new AppError(400, message, code);
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED'): AppError {
    return new AppError(401, message, code);
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN'): AppError {
    return new AppError(403, message, code);
  }

  static notFound(message = 'Not found', code = 'NOT_FOUND'): AppError {
    return new AppError(404, message, code);
  }
}

/**
 * Wraps an async Express route handler so rejected promises are
 * forwarded to Express error middleware (the global handler in index.ts).
 *
 * Usage:
 *   router.get('/items', asyncHandler(async (req, res) => { ... }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void> | void,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

import type { Request, Response, NextFunction } from 'express';
import { asyncHandler, AppError } from '../../middleware/asyncHandler.js';

function mockReq(): Request {
  return {} as Request;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('asyncHandler', () => {
  it('forwards rejected promises to Express next()', async () => {
    const error = new Error('async failure');
    const handler = asyncHandler(async (_req, _res, _next) => {
      throw error;
    });

    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await handler(req, res, next);

    // next() is called asynchronously via .catch — give microtask queue a tick
    await new Promise((r) => setTimeout(r, 0));

    expect(next).toHaveBeenCalledWith(error);
  });

  it('works with synchronous route handlers', async () => {
    const handler = asyncHandler((_req, res, _next) => {
      res.status(200).json({ ok: true });
    });

    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    handler(req, res, next);

    await new Promise((r) => setTimeout(r, 0));

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('does not call next() when handler resolves normally', async () => {
    const handler = asyncHandler(async (_req, res, _next) => {
      res.status(200).json({ data: 'test' });
    });

    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    handler(req, res, next);

    await new Promise((r) => setTimeout(r, 0));

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('AppError', () => {
  it('badRequest creates a 400 error', () => {
    const err = AppError.badRequest('Invalid input');
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Invalid input');
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('unauthorized creates a 401 error', () => {
    const err = AppError.unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Unauthorized');
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('forbidden creates a 403 error', () => {
    const err = AppError.forbidden('No access');
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('No access');
    expect(err.code).toBe('FORBIDDEN');
  });

  it('notFound creates a 404 error', () => {
    const err = AppError.notFound('Resource missing');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Resource missing');
    expect(err.code).toBe('NOT_FOUND');
  });

  it('carries a custom code property', () => {
    const err = AppError.badRequest('Oops', 'CUSTOM_CODE');
    expect(err.code).toBe('CUSTOM_CODE');
    expect(err.name).toBe('AppError');
  });

  it('uses default messages when none provided', () => {
    const unauth = AppError.unauthorized();
    expect(unauth.message).toBe('Unauthorized');

    const forbidden = AppError.forbidden();
    expect(forbidden.message).toBe('Forbidden');

    const notFound = AppError.notFound();
    expect(notFound.message).toBe('Not found');
  });
});

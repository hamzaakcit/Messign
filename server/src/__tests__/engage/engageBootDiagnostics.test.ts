import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeError, errorFields } from '../../engage/log.js';

const assertEngageRoleSafe = vi.fn();
vi.mock('../../engage/db.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../engage/db.js')>()),
  assertEngageRoleSafe: (...a: unknown[]) => assertEngageRoleSafe(...a),
}));
const { mountEngage } = await import('../../engage/index.js');

function connectionFailure(): AggregateError {
  const mk = (address: string, port: number) => Object.assign(new Error(`connect ECONNREFUSED ${address}:${port}`), { code: 'ECONNREFUSED', address, port });
  return Object.assign(new AggregateError([mk('::1', 5432), mk('127.0.0.1', 5432)], ''), { code: 'ECONNREFUSED' });
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); assertEngageRoleSafe.mockReset(); });

describe('describeError', () => {
  it('is never empty for an AggregateError with an empty message, and shows code and addresses', () => {
    const text = describeError(connectionFailure());
    expect(text).toContain('AggregateError');
    expect(text).toContain('ECONNREFUSED');
    expect(text).toContain('::1:5432');
    expect(text).toContain('127.0.0.1:5432');
  });
  it('handles plain errors, empty-message errors, codes, non-errors and nested errors without addresses', () => {
    expect(describeError(new Error('boom'))).toBe('Error boom');
    expect(describeError(new Error(''))).toBe('Error');
    expect(describeError(Object.assign(new Error('x'), { code: 'EPIPE' }))).toBe('Error x EPIPE');
    expect(describeError(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }))).toBe('Error connect ECONNREFUSED');
    expect(describeError('a string')).toBe('non-error thrown');
    expect(describeError(new AggregateError([new Error('first'), new Error('second')], ''))).toContain('[first, second]');
  });
  it('limits very long nested lists', () => {
    const many = new AggregateError(Array.from({ length: 9 }, (_, i) => Object.assign(new Error('e'), { code: 'E' + i })), '');
    expect(describeError(many)).toContain('+4 more');
  });
  it('redacts credentials that appear in a message, and carries no stack', () => {
    const text = describeError(new Error('could not connect to postgresql://engage:hunter2pw@db.internal:5432/x'));
    expect(text).not.toContain('hunter2pw');
    expect(text).not.toContain('\n    at ');
    expect(JSON.stringify(errorFields(new Error('Bearer abcdefghijkl')))).not.toContain('abcdefghijkl');
  });
});

describe('mountEngage reports why it did not mount', () => {
  const app = () => ({ use: vi.fn() }) as unknown as import('express').Express;

  it('logs the connection failure instead of an empty reason', async () => {
    assertEngageRoleSafe.mockRejectedValue(connectionFailure());
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const a = app();
    expect(await mountEngage(a)).toBe(false);
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).toMatch(/NOT mounted: .+/);
    expect(line).toContain('ECONNREFUSED');
    expect(a.use).not.toHaveBeenCalled();
  });
  it('logs a missing production master key', async () => {
    assertEngageRoleSafe.mockResolvedValue('messign_engage');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENGAGE_MASTER_KEY', '');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await mountEngage(app())).toBe(false);
    expect(String(spy.mock.calls[0]?.[0])).toContain('ENGAGE_MASTER_KEY is not set');
  });
  it('mounts when the role is safe and the key is valid', async () => {
    assertEngageRoleSafe.mockResolvedValue('messign_engage');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ENGAGE_MASTER_KEY', 'a1b2c3d4'.repeat(8));
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const a = app();
    expect(await mountEngage(a)).toBe(true);
    expect(a.use).toHaveBeenCalledWith('/api/engage', expect.anything());
  });
});

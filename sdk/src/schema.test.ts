import { parseResolveBody } from './schema.js';

const valid = {
  installationId: '11111111-1111-4111-8111-111111111111',
  environment: 'production' as const,
  mode: 'test' as const,
  audience: 'none' as const,
};

describe('resolve schema', () => {
  it('keeps the four published fields and drops an organization id', () => {
    const parsed = parseResolveBody({ ...valid, organizationId: 'org_1', extra: true });
    expect(parsed).toEqual(valid);
    expect(parsed).not.toHaveProperty('organizationId');
  });

  it('rejects a body that does not match the server response', () => {
    expect(parseResolveBody(null)).toBeNull();
    expect(parseResolveBody({ audience: 'live' })).toBeNull();
    expect(parseResolveBody({ ...valid, audience: 'all' })).toBeNull();
    expect(parseResolveBody({ ...valid, mode: 'preview' })).toBeNull();
    expect(parseResolveBody({ ...valid, environment: 'local' })).toBeNull();
    expect(parseResolveBody({ ...valid, installationId: 'not-a-uuid' })).toBeNull();
  });
});

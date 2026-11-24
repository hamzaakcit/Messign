import { rlsVerifyRoleName } from '../../scripts/rlsVerifyRole.js';

describe('rlsVerifyRoleName', () => {
  it('defaults to messign_app and rejects anything that is not a role identifier', () => {
    expect(rlsVerifyRoleName(undefined)).toBe('messign_app');
    expect(rlsVerifyRoleName('  ')).toBe('messign_app');
    expect(rlsVerifyRoleName('messign_app')).toBe('messign_app');
    expect(() => rlsVerifyRoleName('messign_app; DROP ROLE postgres')).toThrow(/plain Postgres role/);
  });
});

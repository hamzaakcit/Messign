import bcrypt from 'bcrypt';
import { verifyCurrentPasswordMatchesAuth } from '../../services/passwordService.js';

describe('verifyCurrentPasswordMatchesAuth', () => {
  it('returns true when bcrypt matches', async () => {
    const hash = await bcrypt.hash('correct-horse', 12);
    const ok = await verifyCurrentPasswordMatchesAuth(
      { password_hash: hash, temporary_password: null, must_change_password: false },
      'correct-horse',
    );
    expect(ok).toBe(true);
  });

  it('returns false when password is wrong and no dev bypass applies', async () => {
    const hash = await bcrypt.hash('other-secret', 12);
    const ok = await verifyCurrentPasswordMatchesAuth(
      { password_hash: hash, temporary_password: null, must_change_password: false },
      'wrong',
    );
    expect(ok).toBe(false);
  });

  it('in non-production accepts DEV_DEMO_PASSWORD when hash is for a different password', async () => {
    const hash = await bcrypt.hash('not-the-demo', 12);
    const ok = await verifyCurrentPasswordMatchesAuth(
      { password_hash: hash, temporary_password: null, must_change_password: false },
      'test123',
    );
    expect(ok).toBe(true);
  });

  it('accepts temporary_password when must_change_password is true', async () => {
    const hash = await bcrypt.hash('something-else', 12);
    const ok = await verifyCurrentPasswordMatchesAuth(
      {
        password_hash: hash,
        temporary_password: 'temp-pass-99',
        must_change_password: true,
      },
      'temp-pass-99',
    );
    expect(ok).toBe(true);
  });
});

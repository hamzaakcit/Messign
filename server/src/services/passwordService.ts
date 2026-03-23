import { randomInt } from 'node:crypto';
import bcrypt from 'bcrypt';
import {
  getByAuthUserId,
  updatePassword,
  updateTemporaryPassword,
  clearLock,
} from '../db/employeeAuthDb.js';
import { getPasswordPolicy } from '../db/settingsDb.js';
import { insert as insertAudit } from '../db/authAuditDb.js';
import type { PasswordPolicy } from '../types/auth.js';
import { getDefaultSeedPassword } from '../types/auth.js';

const SALT_ROUNDS = 12;

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  strength: number;
}

export async function validatePassword(
  password: string,
  policy?: PasswordPolicy | null
): Promise<ValidationResult> {
  const p = policy ?? (await getPasswordPolicy());
  const errors: string[] = [];
  let strength = 0;

  if (password.length < p.minLength) {
    errors.push(`Password must be at least ${p.minLength} characters`);
  } else {
    strength += 20;
  }
  if (password.length > p.maxLength) {
    errors.push(`Password must be at most ${p.maxLength} characters`);
  }

  if (p.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain an uppercase letter');
  } else if (p.requireUppercase) {
    strength += 20;
  }

  if (p.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain a lowercase letter');
  } else if (p.requireLowercase) {
    strength += 20;
  }

  if (p.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain a number');
  } else if (p.requireNumbers) {
    strength += 20;
  }

  const specialRegex = new RegExp(`[${p.specialCharsAllowed.replace(/[\]\\]/g, '\\$&')}]`);
  if (p.requireSpecialChars && !specialRegex.test(password)) {
    errors.push('Password must contain a special character');
  } else if (p.requireSpecialChars) {
    strength += 20;
  }

  return { isValid: errors.length === 0, errors, strength };
}

export function generateStrongPassword(length: number = 16): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=';
  const all = uppercase + lowercase + numbers + special;

  const chars: string[] = [];
  chars.push(uppercase[randomInt(uppercase.length)]);
  chars.push(lowercase[randomInt(lowercase.length)]);
  chars.push(numbers[randomInt(numbers.length)]);
  chars.push(special[randomInt(special.length)]);

  for (let i = chars.length; i < length; i++) {
    chars.push(all[randomInt(all.length)]);
  }

  // Fisher-Yates shuffle with crypto randomness
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

export async function setPasswordByAdmin(
  oddrooId: string,
  newPassword: string,
  forceChange: boolean,
  adminId: string,
  opts?: { ipAddress?: string; userAgent?: string }
): Promise<void> {
  const validation = await validatePassword(newPassword);
  if (!validation.isValid) {
    throw new Error(`Invalid password: ${validation.errors.join(', ')}`);
  }

  const auth = await getByAuthUserId(oddrooId);
  if (!auth) throw new Error('Employee auth not found');

  const policy = await getPasswordPolicy();
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const history = Array.isArray(auth.password_history) ? auth.password_history : [];
  const maxHistory = policy?.passwordHistoryCount ?? 5;
  const passwordHistory = [passwordHash, ...history].slice(0, maxHistory);

  await updatePassword({
    auth_user_id: oddrooId,
    password_hash: passwordHash,
    password_history: passwordHistory,
    temporary_password: newPassword,
    must_change_password: forceChange,
    updated_by: adminId,
  });

  await insertAudit({
    auth_user_id: adminId,
    target_auth_user_id: oddrooId,
    action: 'password_change_by_admin',
    details: { forceChange },
    ip_address: opts?.ipAddress ?? null,
    user_agent: opts?.userAgent ?? null,
    status: 'success',
    performed_by: adminId,
  });
}

export async function resetToDefaultPassword(
  oddrooId: string,
  adminId: string,
  opts?: { ipAddress?: string; userAgent?: string }
): Promise<void> {
  await setPasswordByAdmin(oddrooId, getDefaultSeedPassword(), true, adminId, opts);

  await insertAudit({
    auth_user_id: adminId,
    target_auth_user_id: oddrooId,
    action: 'password_reset_to_default',
    details: {},
    ip_address: opts?.ipAddress ?? null,
    user_agent: opts?.userAgent ?? null,
    status: 'success',
    performed_by: adminId,
  });
}

export async function viewPassword(
  oddrooId: string,
  adminId: string,
  opts?: { ipAddress?: string; userAgent?: string }
): Promise<{ password: string | null; message: string; passwordSetAt: string | null; passwordSetBy: string; mustChangePassword: boolean }> {
  const auth = await getByAuthUserId(oddrooId);
  if (!auth) throw new Error('Employee auth not found');

  await insertAudit({
    auth_user_id: adminId,
    target_auth_user_id: oddrooId,
    action: 'password_view_by_admin',
    details: {},
    ip_address: opts?.ipAddress ?? null,
    user_agent: opts?.userAgent ?? null,
    status: 'success',
    performed_by: adminId,
  });

  if (auth.temporary_password) {
    return {
      password: auth.temporary_password,
      message: 'Temporary password set by admin',
      passwordSetAt: auth.password_changed_at,
      passwordSetBy: auth.updated_by,
      mustChangePassword: auth.must_change_password,
    };
  }

  return {
    password: null,
    message: 'User has changed their password. Cannot view user-set passwords.',
    passwordSetAt: auth.password_changed_at,
    passwordSetBy: auth.updated_by,
    mustChangePassword: auth.must_change_password,
  };
}

export async function changeOwnPassword(
  oddrooId: string,
  currentPassword: string,
  newPassword: string,
  opts?: { ipAddress?: string; userAgent?: string }
): Promise<void> {
  const auth = await getByAuthUserId(oddrooId);
  if (!auth) throw new Error('Employee auth not found');

  const isValid = await bcrypt.compare(currentPassword, auth.password_hash);
  if (!isValid) {
    throw new Error('Current password is incorrect');
  }

  const validation = await validatePassword(newPassword);
  if (!validation.isValid) {
    throw new Error(`Invalid password: ${validation.errors.join(', ')}`);
  }

  const policy = await getPasswordPolicy();
  const history = Array.isArray(auth.password_history) ? auth.password_history : [];
  for (const oldHash of history) {
    const isReused = await bcrypt.compare(newPassword, oldHash);
    if (isReused) {
      throw new Error('Cannot reuse recent passwords');
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const maxHistory = policy?.passwordHistoryCount ?? 5;
  const passwordHistory = [passwordHash, ...history].slice(0, maxHistory);

  await updatePassword({
    auth_user_id: oddrooId,
    password_hash: passwordHash,
    password_history: passwordHistory,
    temporary_password: null,
    must_change_password: false,
    updated_by: oddrooId,
  });

  await insertAudit({
    auth_user_id: oddrooId,
    action: 'password_change_self',
    details: {},
    ip_address: opts?.ipAddress ?? null,
    user_agent: opts?.userAgent ?? null,
    status: 'success',
    performed_by: 'self',
  });
}

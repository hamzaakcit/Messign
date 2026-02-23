import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { authAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

function passwordStrength(pwd: string): number {
  let s = 0;
  if (pwd.length >= 8) s += 20;
  if (/[A-Z]/.test(pwd)) s += 20;
  if (/[a-z]/.test(pwd)) s += 20;
  if (/[0-9]/.test(pwd)) s += 20;
  if (/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(pwd)) s += 20;
  return s;
}

const REQUIREMENTS = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter (A-Z)', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter (a-z)', test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number (0-9)', test: (p: string) => /[0-9]/.test(p) },
  { label: 'One special character (!@#$%^&*)', test: (p: string) => /[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(p) },
];

export function ForcePasswordChangePage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { setMustChangePassword } = useAuthStore();
  const navigate = useNavigate();

  const strength = passwordStrength(newPassword);
  const allMet = REQUIREMENTS.every((r) => r.test(newPassword));
  const match = newPassword && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!allMet) {
      setError('Please meet all password requirements.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setIsLoading(true);
    try {
      await authAPI.changePassword(currentPassword, newPassword);
      setMustChangePassword(false);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--app-bg)] p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--app-text)]">Password Change Required</h1>
          <p className="mt-2 text-sm text-[var(--app-text-muted)]">
            For security reasons, you must change your password before continuing.
          </p>
        </div>

        <div className="p-6 rounded-xl bg-[var(--app-card)] border border-[var(--app-border)]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center">
              <Lock className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="font-semibold text-[var(--app-text)]">Change Your Password</h2>
              <p className="text-xs text-[var(--app-text-muted)]">This is a one-time requirement.</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--app-text)] mb-1.5">Current Password</label>
              <div className="relative">
                <Input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full pr-10"
                  icon={<Lock className="w-4 h-4" />}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)]"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--app-text)] mb-1.5">New Password</label>
              <div className="relative">
                <Input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full pr-10"
                  icon={<Lock className="w-4 h-4" />}
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)]"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--app-text)] mb-1.5">Confirm New Password</label>
              <div className="relative">
                <Input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full pr-10"
                  icon={<Lock className="w-4 h-4" />}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--app-text-muted)]"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs text-[var(--app-text-muted)] mb-1">Password Strength</p>
              <div className="h-2 rounded-full bg-[var(--app-border)] overflow-hidden flex">
                <div
                  className={cn(
                    'h-full transition-all duration-300',
                    strength <= 40 ? 'bg-red-500' : strength <= 60 ? 'bg-yellow-500' : 'bg-green-500'
                  )}
                  style={{ width: `${strength}%` }}
                />
              </div>
              <p className="text-xs text-[var(--app-text-muted)] mt-1">
                {strength === 0 ? 'None' : strength <= 40 ? 'Weak' : strength <= 60 ? 'Fair' : 'Strong'}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-[var(--app-text)] mb-2">Requirements</p>
              <ul className="space-y-1">
                {REQUIREMENTS.map((r) => (
                  <li
                    key={r.label}
                    className={cn(
                      'text-xs flex items-center gap-2',
                      r.test(newPassword) ? 'text-green-500' : 'text-[var(--app-text-muted)]'
                    )}
                  >
                    <span>{r.test(newPassword) ? '✅' : '○'}</span> {r.label}
                  </li>
                ))}
              </ul>
            </div>

            <Button
              type="submit"
              disabled={!allMet || !match || !currentPassword}
              isLoading={isLoading}
              className="w-full"
            >
              Change Password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

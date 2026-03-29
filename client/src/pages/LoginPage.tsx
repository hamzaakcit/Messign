/**
 * Login UI — email/password only. Auth contract is unchanged:
 * - `useAuthStore().login` → `authAPI.login` → `POST /api/auth/login` with `credentials: 'include'`
 *   so HttpOnly `refreshToken` is set by the server (`server/src/routes/auth.ts`); do not remove `credentials` or move token handling to ad-hoc fetches.
 */
import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, ArrowRight, Sparkles } from 'lucide-react';
import { LoginFalPaperPlanePanel } from '@/components/login';
import { LoginCrewStrip } from '@/components/login/LoginCrewStrip';
import { LoginWelcomeHeadline } from '@/components/login/LoginWelcomeHeadline';
import { FloatingLoginField } from '@/components/login/FloatingLoginField';
import { PaperplaneButtonSpinner } from '@/components/login/PaperplaneButtonSpinner';
import { loginFormSchema, type LoginFormValues } from '@/components/login/loginSchema';
import { useAuthStore } from '@/stores/authStore';

export function LoginPage(): JSX.Element {
  const [showPassword, setShowPassword] = useState(false);
  const [welcomeAnimate, setWelcomeAnimate] = useState(false);

  const { login, isLoading, error, loginError, clearError } = useAuthStore();
  const isAccountLocked = loginError?.code === 'ACCOUNT_LOCKED';
  const navigate = useNavigate();

  const { control, handleSubmit } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
    mode: 'onSubmit',
  });

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    if (mql.matches) setWelcomeAnimate(true);
  }, []);

  const displayError =
    typeof (loginError?.message ?? error) === 'string' ? (loginError?.message ?? error) : null;

  const onSubmit = handleSubmit(async (data) => {
    clearError();
    await login(data.email, data.password, data.rememberMe);
    const state = useAuthStore.getState();
    if (!state.isAuthenticated) return;
    if (state.mustChangePassword) navigate('/force-password-change', { replace: true });
    else navigate('/', { replace: true });
  });

  return (
    <main
      className="login-page-autofill flex h-[100dvh] w-screen max-w-[100vw] flex-col overflow-hidden bg-[#121212] font-sans text-white/95 md:flex-row"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <LoginFalPaperPlanePanel onHeroMotionReady={() => setWelcomeAnimate(true)} />

      <section className="relative z-10 flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-y-auto px-5 py-8 md:w-[40%] md:max-w-[40%] md:flex-[0_0_40%] md:overflow-hidden md:px-8 md:py-10">
        <div className="w-full max-w-[min(100%,22rem)]">
          <div
            className="relative overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.05] p-6 shadow-2xl shadow-black/50 backdrop-blur-xl md:p-7"
            style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset' }}
          >
            <div className="relative flex flex-col">
              <div className="mb-6 flex flex-col items-center">
                <h1 className="text-xl font-bold tracking-tight text-white">Messign</h1>
              </div>

              <LoginCrewStrip />

              <LoginWelcomeHeadline animate={welcomeAnimate} />

              {displayError ? (
                <div
                  role="alert"
                  aria-live="polite"
                  className="mb-5 flex flex-col gap-2 rounded-xl border border-blue-800/80 bg-blue-950/40 p-3.5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-900/80">
                      <span className="font-bold text-blue-400">!</span>
                    </div>
                    <span className="text-[13px] text-blue-200">{displayError}</span>
                    {loginError?.remainingAttempts != null ? (
                      <span className="text-xs text-blue-400">
                        ({loginError.remainingAttempts} attempts left)
                      </span>
                    ) : null}
                  </div>
                  {import.meta.env.DEV && isAccountLocked ? (
                    <p className="mt-1 text-xs leading-relaxed text-amber-200/95">
                      Too many failed attempts locked this account. From the repo run{' '}
                      <code className="rounded bg-black/30 px-1 text-white/90">
                        cd server &amp;&amp; npm run auth:set-alex
                      </code>{' '}
                      to reset the demo password and clear the lock, then sign in with{' '}
                      <code className="rounded bg-black/30 px-1 text-white/90">test123</code> (exactly, all
                      lowercase).
                    </p>
                  ) : null}
                  {import.meta.env.DEV && !isAccountLocked ? (
                    <p className="mt-1 text-xs text-white/45">
                      Local dev:{' '}
                      <code className="rounded bg-black/30 px-1 text-white/55">alex.chen@messign.com</code> /{' '}
                      <code className="rounded bg-black/30 px-1 text-white/55">test123</code> after{' '}
                      <code className="rounded bg-black/30 px-1 text-white/55">npm run db:seed</code>. API on port
                      3001.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <form onSubmit={onSubmit} className="space-y-3.5" noValidate>
                <FloatingLoginField
                  name="email"
                  control={control}
                  label="Email address"
                  type="email"
                  autoComplete="email"
                  testId="login-email"
                  icon={<Mail className="h-5 w-5" />}
                />

                <FloatingLoginField
                  name="password"
                  control={control}
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  testId="login-password"
                  icon={<Lock className="h-5 w-5" />}
                  showPassword={showPassword}
                  onTogglePassword={() => setShowPassword((s) => !s)}
                  togglePasswordLabel={showPassword ? 'Hide password' : 'Show password'}
                />

                <Controller
                  name="rememberMe"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center justify-between pt-0.5">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          className="h-4 w-4 rounded border-white/20 bg-[#121212] text-blue-500 focus:ring-2 focus:ring-blue-500/40"
                        />
                        <span className="text-[13px] text-white/50">Remember me</span>
                      </label>
                    </div>
                  )}
                />

                <button
                  data-testid="login-submit"
                  type="submit"
                  disabled={isLoading}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-950/35 transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <PaperplaneButtonSpinner />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <p className="mt-3 text-center text-[13px] text-white/45">
                  Don&apos;t have an account?{' '}
                  <Link
                    to="/signup"
                    className="font-medium text-blue-400 underline-offset-2 transition-colors hover:text-blue-300 hover:underline"
                  >
                    Sign Up
                  </Link>
                </p>
              </form>

              <div className="mt-5 rounded-xl border border-white/[0.08] bg-black/20 p-3.5">
                <div className="flex items-start gap-3">
                  <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-white/40" aria-hidden />
                  <div>
                    <p className="text-[13px] text-white/50">
                      <span className="font-medium text-white/80">Need help?</span>
                      <br />
                      Contact your administrator to reset your password.
                    </p>
                  </div>
                </div>
              </div>

              <p className="mt-6 border-t border-white/[0.08] pt-5 text-center text-[11px] text-white/40">
                Messign Workspace
              </p>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-[13px] text-white/40">© 2026 Messign. All rights reserved.</p>
            <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-white/35">
              <a href="#" className="transition-colors hover:text-blue-400">
                Privacy
              </a>
              <span aria-hidden>•</span>
              <a href="#" className="transition-colors hover:text-blue-400">
                Terms
              </a>
              <span aria-hidden>•</span>
              <a href="#" className="transition-colors hover:text-blue-400">
                Support
              </a>
            </div>
          </div>
        </div>
      </section>

    </main>
  );
}

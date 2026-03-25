import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { FloatingBadges, LoginCursorGlow, ParticleEffect, PulseRings } from '@/components/login';
import { MessignLogoAnimated } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const { login, isLoading, error, loginError, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await login(email.trim(), password, rememberMe);
    const state = useAuthStore.getState();
    if (state.isAuthenticated) {
      if (state.mustChangePassword) navigate('/force-password-change', { replace: true });
      else navigate('/', { replace: true });
    }
  };

  const displayError = typeof (loginError?.message ?? error) === 'string' ? (loginError?.message ?? error) : null;

  return (
    <div className="login-page-autofill min-h-screen bg-app-bg relative overflow-hidden">
      {/* Deep base (Dora empty-state tone) — no matrix canvas */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          zIndex: 0,
          background:
            'radial-gradient(ellipse 120% 80% at 50% 0%, #0a1628 0%, var(--dora-bg-deep) 55%)',
        }}
        aria-hidden
      />
      <ParticleEffect />
      <FloatingBadges />

      {/* Lighter than before so cursor glow + particles read through */}
      <div
        className="absolute inset-0 pointer-events-none bg-app-bg/45"
        style={{ zIndex: 3 }}
      />

      <LoginCursorGlow />

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 4 }}>
        <PulseRings />
      </div>

      <div className="relative min-h-screen flex items-center justify-center p-4" style={{ zIndex: 10 }}>
        <div className="w-full max-w-md">
          <div
            className="
              bg-app-sidebar
              rounded-2xl shadow-lg shadow-black/40
              border border-app-border
              p-8 md:p-10
              relative overflow-hidden
            "
          >
            <div className="relative flex flex-col">
              {/* Animated logo: paper plane boomerang */}
              <div className="flex flex-col items-center mb-6">
                <div className="flex justify-center">
                  <MessignLogoAnimated
                    size={72}
                    autoPlay
                    loop
                    loopDelay={6000}
                    playOnHover={false}
                  />
                </div>
                <h1 className="text-2xl font-bold text-app-text tracking-tight mt-3">
                  Messign
                </h1>
              </div>

              <div className="text-center mb-8">
                <h2 className="text-xl font-semibold text-app-text">Welcome back</h2>
                <p className="text-app-muted text-sm mt-1">Sign in to access your workspace</p>
              </div>

              {displayError && (
                <div className="mb-6 p-4 rounded-xl bg-red-950/40 border border-red-800 flex flex-col gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-900/80 flex items-center justify-center shrink-0">
                      <span className="text-red-400 font-bold">!</span>
                    </div>
                    <span className="text-red-300 text-sm">{displayError}</span>
                    {loginError?.remainingAttempts != null && (
                      <span className="text-xs text-red-400">({loginError.remainingAttempts} attempts left)</span>
                    )}
                  </div>
                  {import.meta.env.DEV && (
                    <p className="text-xs text-app-muted mt-1">
                      Local dev: use an email ending with @messign.com. Ensure the server is running on port 3001 and the DB is seeded (e.g. <code className="bg-app-card px-1 rounded text-app-muted">npm run db:seed</code> in server). Seed users use the default password from <code className="bg-app-card px-1 rounded text-app-muted">server/src/types/auth.ts</code>.
                    </p>
                  )}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-app-muted">Email Address</label>
                  <div className="group relative rounded-xl transition-colors duration-300">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-[1]">
                      <Mail className="w-5 h-5 text-app-muted transition-colors group-focus-within:text-blue-400" />
                    </div>
                    <input
                      data-testid="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@messign.com"
                      required
                      autoComplete="email"
                      className="
                        w-full pl-12 pr-4 py-4 rounded-xl
                        bg-app-card border border-app-border
                        text-app-text placeholder:text-app-muted
                        focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 focus:outline-none
                        transition-all duration-300
                      "
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-app-muted">Password</label>
                  <div className="group relative rounded-xl transition-colors duration-300">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-[1]">
                      <Lock className="w-5 h-5 text-app-muted transition-colors group-focus-within:text-blue-400" />
                    </div>
                    <input
                      data-testid="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      autoComplete="current-password"
                      className="
                        w-full pl-12 pr-12 py-4 rounded-xl
                        bg-app-card border border-app-border
                        text-app-text placeholder:text-app-muted
                        focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 focus:outline-none
                        transition-all duration-300
                      "
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-app-muted hover:text-blue-400 transition-colors z-[1]"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-app-border bg-app-bg text-blue-500 focus:ring-blue-500 focus:ring-offset-app-card"
                    />
                    <span className="text-sm text-app-muted">Remember me</span>
                  </label>
                </div>

                <button
                  data-testid="login-submit"
                  type="submit"
                  disabled={isLoading}
                  className="
                    w-full py-3.5 px-6 rounded-xl
                    bg-blue-600 text-app-text font-medium text-base
                    shadow-lg shadow-blue-900/40
                    hover:bg-blue-700 active:bg-blue-800
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors duration-200
                    flex items-center justify-center gap-2
                  "
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>

                <p className="text-center text-sm text-app-muted mt-4">
                  Don&apos;t have an account?{' '}
                  <Link to="/signup" className="font-medium text-blue-400 hover:text-blue-300 transition-colors">
                    Sign Up
                  </Link>
                </p>
              </form>

              <div className="mt-6 p-4 rounded-xl bg-app-card/70 border border-app-border/60">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-app-muted mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-app-muted">
                      <span className="font-medium text-app-text">Need help?</span>
                      <br />
                      Contact your administrator to reset your password.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer label: subtle, neutral, does not compete with primary actions */}
              <p className="mt-8 pt-6 text-center text-xs text-app-muted border-t border-app-border">
                Messign Workspace
              </p>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-app-muted text-sm">© 2026 Messign. All rights reserved.</p>
            <div className="mt-2 flex items-center justify-center gap-4 text-xs text-app-muted">
              <a href="#" className="hover:text-blue-400 transition-colors">
                Privacy
              </a>
              <span>•</span>
              <a href="#" className="hover:text-blue-400 transition-colors">
                Terms
              </a>
              <span>•</span>
              <a href="#" className="hover:text-blue-400 transition-colors">
                Support
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

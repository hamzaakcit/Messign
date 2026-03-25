import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { DoraLoginMascot, type ActiveField } from '@/components/login/DoraLoginMascot';
import { useMousePosition } from '@/components/login/useMousePosition';
import { useAuthStore } from '@/stores/authStore';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [activeField, setActiveField] = useState<ActiveField>('none');

  const { login, isLoading, error, loginError, clearError } = useAuthStore();
  const navigate = useNavigate();
  const { ref: containerRef, x: mouseX, y: mouseY } = useMousePosition();

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await login(email.trim(), password, rememberMe);
    const state = useAuthStore.getState();
    if (state.isAuthenticated) {
      if (state.mustChangePassword) navigate('/force-password-change', { replace: true });
      else navigate('/', { replace: true });
    }
  }, [email, password, rememberMe, clearError, login, navigate]);

  const displayError = typeof (loginError?.message ?? error) === 'string' ? (loginError?.message ?? error) : null;

  return (
    <div
      ref={containerRef}
      className="min-h-screen relative overflow-hidden flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #F5C842 0%, #F0B429 50%, #E9A820 100%)' }}
    >
      {/* Subtle pattern overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, #000 1px, transparent 0)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative z-10 w-full max-w-6xl mx-auto px-4 py-8 flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-4">
        {/* ===== Left: Login Card ===== */}
        <div className="w-full max-w-md lg:max-w-lg shrink-0 order-2 lg:order-1">
          <div
            className="rounded-3xl p-8 md:p-10"
            style={{
              background: 'rgba(255, 248, 220, 0.55)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255,255,255,0.4)',
            }}
          >
            {/* Heading */}
            <h1
              className="text-3xl md:text-4xl font-bold mb-8"
              style={{ color: '#1a1a1a' }}
            >
              Welcome Back !
            </h1>

            {/* Error */}
            {displayError && (
              <div className="mb-6 p-4 rounded-xl flex flex-col gap-2"
                style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(239, 68, 68, 0.2)' }}>
                    <span className="font-bold text-sm" style={{ color: '#dc2626' }}>!</span>
                  </div>
                  <span className="text-sm" style={{ color: '#991b1b' }}>{displayError}</span>
                  {loginError?.remainingAttempts != null && (
                    <span className="text-xs" style={{ color: '#dc2626' }}>
                      ({loginError.remainingAttempts} attempts left)
                    </span>
                  )}
                </div>
                {import.meta.env.DEV && (
                  <p className="text-xs mt-1" style={{ color: '#92400e' }}>
                    Local dev: use an email ending with @messign.com. Ensure the server is running on port 3001 and the DB is seeded.
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: '#374151' }}>
                  Email
                </label>
                <input
                  data-testid="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setActiveField('email')}
                  onBlur={() => setActiveField('none')}
                  placeholder="you@messign.com"
                  required
                  autoComplete="email"
                  className="w-full px-4 py-3.5 rounded-xl text-sm transition-all duration-200 outline-none"
                  style={{
                    background: '#ffffff',
                    border: '1.5px solid rgba(0,0,0,0.08)',
                    color: '#1a1a1a',
                  }}
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="block text-sm font-medium" style={{ color: '#374151' }}>
                  Password
                </label>
                <div className="relative">
                  <input
                    data-testid="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setActiveField('password')}
                    onBlur={() => setActiveField('none')}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                    className="w-full px-4 py-3.5 pr-12 rounded-xl text-sm transition-all duration-200 outline-none"
                    style={{
                      background: '#ffffff',
                      border: '1.5px solid rgba(0,0,0,0.08)',
                      color: '#1a1a1a',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center transition-colors"
                    style={{ color: '#9ca3af' }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword
                      ? <EyeOff className="w-5 h-5" />
                      : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Forgot + Remember */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded"
                    style={{ accentColor: '#1E88E5' }}
                  />
                  <span className="text-sm" style={{ color: '#666' }}>Remember me</span>
                </label>
                <a
                  href="#"
                  className="text-sm font-medium transition-colors hover:underline"
                  style={{ color: '#1565C0' }}
                >
                  Forgot Password?
                </a>
              </div>

              {/* Submit */}
              <button
                data-testid="login-submit"
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-6 rounded-xl font-semibold text-base text-white flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: isLoading ? '#64b5f6' : '#1E88E5',
                  boxShadow: '0 4px 14px rgba(30, 136, 229, 0.35)',
                }}
                onMouseEnter={(e) => { if (!isLoading) e.currentTarget.style.background = '#1565C0'; }}
                onMouseLeave={(e) => { if (!isLoading) e.currentTarget.style.background = '#1E88E5'; }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Log in</span>
                )}
              </button>

              {/* Sign up link */}
              <p className="text-center text-sm" style={{ color: '#666' }}>
                Don&apos;t have an account?{' '}
                <Link
                  to="/signup"
                  className="font-bold transition-colors hover:underline"
                  style={{ color: '#1a1a1a' }}
                >
                  Register for free
                </Link>
              </p>
            </form>
          </div>

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm" style={{ color: 'rgba(0,0,0,0.45)' }}>
              &copy; 2026 Messign. All rights reserved.
            </p>
            <div className="mt-2 flex items-center justify-center gap-4 text-xs" style={{ color: 'rgba(0,0,0,0.35)' }}>
              <a href="#" className="hover:underline">Privacy</a>
              <span>&middot;</span>
              <a href="#" className="hover:underline">Terms</a>
              <span>&middot;</span>
              <a href="#" className="hover:underline">Support</a>
            </div>
          </div>
        </div>

        {/* ===== Right: Dora Mascot ===== */}
        <div className="flex-1 flex items-center justify-center order-1 lg:order-2 max-w-[500px]">
          <div className="hidden sm:block">
            <DoraLoginMascot
              mouseX={mouseX}
              mouseY={mouseY}
              activeField={activeField}
              size={380}
            />
          </div>
          {/* Smaller on small screens */}
          <div className="block sm:hidden">
            <DoraLoginMascot
              mouseX={mouseX}
              mouseY={mouseY}
              activeField={activeField}
              size={200}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

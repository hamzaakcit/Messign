import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { MatrixRain, FloatingBadges, ParticleEffect, PulseRings } from '@/components/login';
import { MessignLogoAnimated } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const { login, isLoading, error, loginError, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    await login(email.trim(), password);
    const state = useAuthStore.getState();
    if (state.isAuthenticated) {
      if (state.mustChangePassword) navigate('/force-password-change', { replace: true });
      else navigate('/', { replace: true });
    }
  };

  const displayError = typeof (loginError?.message ?? error) === 'string' ? (loginError?.message ?? error) : null;

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <MatrixRain />
      <ParticleEffect />
      <FloatingBadges />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          zIndex: 3,
          background: 'rgba(255,255,255,0.85)',
        }}
      />

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 4 }}>
        <PulseRings />
      </div>

      <div className="relative min-h-screen flex items-center justify-center p-4" style={{ zIndex: 10 }}>
        <div className="w-full max-w-md">
          <div
            className="
              bg-white
              rounded-2xl shadow-lg
              border border-gray-200
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
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight mt-3">
                  Messign
                </h1>
              </div>

              <div className="text-center mb-8">
                <h2 className="text-xl font-semibold text-gray-800">Welcome back</h2>
                <p className="text-gray-500 text-sm mt-1">Sign in to access your workspace</p>
              </div>

              {displayError && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                    <span className="text-red-500 font-bold">!</span>
                  </div>
                  <span className="text-red-600 text-sm">{displayError}</span>
                  {loginError?.remainingAttempts != null && (
                    <span className="text-xs text-red-500">({loginError.remainingAttempts} attempts left)</span>
                  )}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Email Address</label>
                  <div
                    className={`
                      relative rounded-xl transition-all duration-300
                      ${focusedField === 'email' ? 'ring-2 ring-blue-500 ring-offset-2' : 'ring-1 ring-gray-200'}
                    `}
                  >
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Mail
                        className={`w-5 h-5 transition-colors ${focusedField === 'email' ? 'text-blue-500' : 'text-gray-400'}`}
                      />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setFocusedField('email')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="you@messign.com"
                      required
                      autoComplete="email"
                      className="
                        w-full pl-12 pr-4 py-4 rounded-xl
                        bg-gray-50 border-0
                        text-gray-800 placeholder-gray-400
                        focus:bg-white focus:outline-none
                        transition-all duration-300
                      "
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Password</label>
                  <div
                    className={`
                      relative rounded-xl transition-all duration-300
                      ${focusedField === 'password' ? 'ring-2 ring-blue-500 ring-offset-2' : 'ring-1 ring-gray-200'}
                    `}
                  >
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Lock
                        className={`w-5 h-5 transition-colors ${focusedField === 'password' ? 'text-blue-500' : 'text-gray-400'}`}
                      />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setFocusedField('password')}
                      onBlur={() => setFocusedField(null)}
                      placeholder="Enter your password"
                      required
                      autoComplete="current-password"
                      className="
                        w-full pl-12 pr-12 py-4 rounded-xl
                        bg-gray-50 border-0
                        text-gray-800 placeholder-gray-400
                        focus:bg-white focus:outline-none
                        transition-all duration-300
                      "
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-blue-500 transition-colors"
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
                      className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-600">Remember me</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="
                    w-full py-3.5 px-6 rounded-xl
                    bg-blue-600 text-white font-medium text-base
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
              </form>

              <div className="mt-6 p-4 rounded-xl bg-gray-50 border border-gray-200">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-gray-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium text-gray-800">Need help?</span>
                      <br />
                      Contact your administrator to reset your password.
                    </p>
                  </div>
                </div>
              </div>

              {/* Footer label: subtle, neutral, does not compete with primary actions */}
              <p className="mt-8 pt-6 text-center text-xs text-gray-400 border-t border-gray-100">
                Messign Workspace
              </p>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-gray-400 text-sm">© 2026 Messign. All rights reserved.</p>
            <div className="mt-2 flex items-center justify-center gap-4 text-xs text-gray-400">
              <a href="#" className="hover:text-blue-500 transition-colors">
                Privacy
              </a>
              <span>•</span>
              <a href="#" className="hover:text-blue-500 transition-colors">
                Terms
              </a>
              <span>•</span>
              <a href="#" className="hover:text-blue-500 transition-colors">
                Support
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

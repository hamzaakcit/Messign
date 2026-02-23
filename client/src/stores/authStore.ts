import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';
import { authAPI } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import { setAccessToken } from '@/lib/authToken';

export interface LoginError {
  code?: string;
  message: string;
  remainingAttempts?: number;
  lockedUntil?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  mustChangePassword: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
  loginError: LoginError | null;
  /** Set to true when persist has rehydrated; prevents rehydration from overwriting a fresh login */
  _hasHydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<boolean>;
  updateUser: (updates: Partial<User>) => void;
  setMustChangePassword: (value: boolean) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      mustChangePassword: false,
      isAuthenticated: false,
      isAdmin: false,
      isLoading: false,
      error: null,
      loginError: null,
      _hasHydrated: false,

      login: async (email: string, password: string) => {
        try {
          set({ isLoading: true, error: null, loginError: null });
          const res = await authAPI.login(email, password);
          const data = (res as { success?: boolean; data?: unknown; error?: LoginError }).data;
          const err = (res as { success?: boolean; error?: LoginError }).error;
          if (err) {
            set({
              loginError: err,
              error: err.message,
              isLoading: false,
            });
            return;
          }
          if (!data || typeof data !== 'object') {
            set({ error: 'Invalid response', isLoading: false });
            return;
          }
          const d = data as {
            accessToken: string;
            refreshToken: string;
            expiresIn: number;
            user: User;
            mustChangePassword: boolean;
          };
          const expiresAt = Date.now() + (d.expiresIn ?? 900) * 1000;
          setAccessToken(d.accessToken);
          set({
            user: d.user,
            accessToken: d.accessToken,
            refreshToken: d.refreshToken,
            expiresAt,
            mustChangePassword: d.mustChangePassword ?? false,
            isAuthenticated: true,
            isAdmin: d.user?.role === 'admin',
            isLoading: false,
            error: null,
            loginError: null,
            _hasHydrated: true,
          });
          if (d.user?.id) connectSocket(d.user.id);
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Sign in failed. Try again.',
            isLoading: false,
          });
        }
      },

      logout: async () => {
        try {
          await authAPI.logout(get().refreshToken ?? undefined);
        } catch {
          // ignore
        }
        setAccessToken(null);
        disconnectSocket();
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          mustChangePassword: false,
          isAuthenticated: false,
          isAdmin: false,
        });
      },

      refreshAccessToken: async () => {
        const refreshToken = get().refreshToken;
        if (!refreshToken) return false;
        try {
          const res = await authAPI.refresh(refreshToken);
          const data = (res as { success?: boolean; data?: { accessToken: string; refreshToken: string; expiresIn: number } }).data;
          if (!data) return false;
          const expiresAt = Date.now() + (data.expiresIn ?? 900) * 1000;
          setAccessToken(data.accessToken);
          set({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            expiresAt,
          });
          return true;
        } catch {
          return false;
        }
      },

      updateUser: (updates) => {
        const { user } = get();
        if (user) {
          const next = { ...user, ...updates };
          set({ user: next, isAdmin: next.role === 'admin' });
        }
      },

      setMustChangePassword: (value) => set({ mustChangePassword: value }),

      clearError: () => set({ error: null, loginError: null }),
    }),
    {
      name: 'messign-auth',
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        expiresAt: s.expiresAt,
        mustChangePassword: s.mustChangePassword,
        isAuthenticated: s.isAuthenticated,
        isAdmin: s.isAdmin,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AuthState> | undefined;
        const current = currentState as AuthState;
        if (!persisted) return current;
        const merged = { ...current, ...persisted };
        if (current.isAuthenticated && current.accessToken) {
          merged.user = current.user;
          merged.accessToken = current.accessToken;
          merged.refreshToken = current.refreshToken;
          merged.expiresAt = current.expiresAt;
          merged.isAuthenticated = true;
          merged.isAdmin = current.isAdmin;
          merged.mustChangePassword = current.mustChangePassword;
        }
        return merged;
      },
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken) setAccessToken(state.accessToken);
        useAuthStore.setState({ _hasHydrated: true });
      },
    }
  )
);

/**
 * Dora Chat Store — persists conversations across navigation.
 *
 * - Each "session" is one conversation thread.
 * - Messages survive navigate-away / page refreshes via localStorage.
 * - Sidebar lists all sessions sorted by last activity.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AIMessage } from '@/types/knowledge-hub/ai';
import { getAccessToken } from '@/lib/authToken';
import { API_ORIGIN } from '@/lib/api';

const MAX_LOCAL_SESSIONS = 30;
const MAX_MESSAGES_PER_SESSION = 100;

export interface DoraSession {
  id: string;
  title: string;
  messages: AIMessage[];
  createdAt: string; // ISO string (serializable)
  updatedAt: string;
}

interface DoraState {
  sessions: DoraSession[];
  activeSessionId: string | null;

  // Session management
  createSession: (title?: string) => DoraSession;
  setActiveSession: (id: string) => void;
  deleteSession: (id: string) => void;
  clearAllSessions: () => void;

  // Message management (all operate on active session)
  getActiveMessages: () => AIMessage[];
  setActiveMessages: (messages: AIMessage[]) => void;
  updateSessionTitle: (id: string, title: string) => void;
}

export const useDoraStore = create<DoraState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,

      createSession: (title = 'New conversation') => {
        const session: DoraSession = {
          id: crypto.randomUUID(),
          title,
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        set((state) => ({
          sessions: [session, ...state.sessions].slice(0, MAX_LOCAL_SESSIONS),
          activeSessionId: session.id,
        }));
        return session;
      },

      setActiveSession: (id) => {
        set({ activeSessionId: id });
      },

      deleteSession: (id) => {
        set((state) => {
          const remaining = state.sessions.filter((s) => s.id !== id);
          const newActiveId =
            state.activeSessionId === id
              ? (remaining[0]?.id ?? null)
              : state.activeSessionId;
          return { sessions: remaining, activeSessionId: newActiveId };
        });
        // Also delete from backend (fire and forget)
        const token = getAccessToken();
        if (token) {
          fetch(`${API_ORIGIN}/api/dora/sessions/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
      },

      clearAllSessions: () => {
        set({ sessions: [], activeSessionId: null });
      },

      getActiveMessages: () => {
        const { sessions, activeSessionId } = get();
        if (!activeSessionId) return [];
        return sessions.find((s) => s.id === activeSessionId)?.messages ?? [];
      },

      setActiveMessages: (messages) => {
        const { activeSessionId } = get();
        if (!activeSessionId) return;
        const truncated = messages.slice(-MAX_MESSAGES_PER_SESSION);
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === activeSessionId
              ? {
                  ...s,
                  messages: truncated,
                  updatedAt: new Date().toISOString(),
                  // Auto-set title from first user message
                  title:
                    s.title === 'New conversation'
                      ? (truncated.find((m) => m.role === 'user')?.content?.slice(0, 60) ?? s.title)
                      : s.title,
                }
              : s,
          ),
        }));
      },

      updateSessionTitle: (id, title) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title: title.slice(0, 80) } : s,
          ),
        }));
      },
    }),
    {
      name: 'dora-chat-store',
      // Only persist sessions and activeSessionId (not functions)
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
      }),
    },
  ),
);

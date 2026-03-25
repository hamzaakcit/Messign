import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { MOTION } from '@/styles/design-tokens';
import { API_ORIGIN } from '@/lib/api';
import { getAccessToken } from '@/lib/authToken';
import { cn } from '@/lib/utils';
import { onDoraNewInsight, type DoraRealtimeInsight } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';

type Module =
  | 'dashboard'
  | 'finance'
  | 'projects'
  | 'knowledge'
  | 'team'
  | 'chat'
  | 'achievements'
  | 'sales'
  | 'marketing'
  | 'recruitment'
  | 'assets'
  | 'contracts'
  | 'support'
  | 'okr'
  | 'culture';

interface DoraInsightBarProps {
  module: Module;
  className?: string;
  fallback?: string;
}

const FALLBACK_MESSAGES: Record<Module, string> = {
  dashboard: "Good morning. Here's your daily overview across all departments.",
  finance: 'Dora is monitoring budgets, expenses, and invoices in real-time.',
  projects:
    'Dora is tracking sprint velocity and task completion across your projects.',
  knowledge: 'Dora can search across all documents. Try asking a question.',
  team: 'Dora analyzes team performance and engagement patterns.',
  chat: 'Dora can extract action items and summarize conversations.',
  achievements: 'Keep earning XP across the workspace to unlock new badges.',
  sales: 'Dora is tracking your sales pipeline and deal velocity.',
  marketing: 'Dora tracks campaign ROI and identifies your highest-performing channels.',
  recruitment: 'Dora screens resumes and tracks hiring pipeline efficiency.',
  assets: 'Dora monitors equipment warranties and license utilization.',
  contracts: 'Dora tracks renewals and extracts key terms from your contracts.',
  support: 'Dora monitors ticket SLAs and detects patterns across support requests.',
  okr: 'Dora tracks OKR progress and flags at-risk goals.',
  culture: 'Dora monitors team health and engagement patterns to help build a stronger culture.',
};

const DISMISS_TTL_MS = 24 * 60 * 60 * 1000;

function getDismissKey(module: string) {
  return `dora-insight-dismissed-${module}`;
}

function isDismissed(module: string): boolean {
  try {
    const raw = localStorage.getItem(getDismissKey(module));
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function normalizeInsightModule(module: string): string {
  return module === 'crm' ? 'sales' : module;
}

function buildHeaders(userId?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (userId) headers['X-User-Id'] = userId;
  return headers;
}

function getBarStyles(severity: DoraRealtimeInsight['severity'] | 'fallback') {
  switch (severity) {
    case 'critical':
      return {
        background: 'linear-gradient(135deg, rgba(127, 29, 29, 0.95) 0%, var(--app-bg) 100%)',
        borderColor: 'rgba(239, 68, 68, 0.35)',
        iconBg: 'linear-gradient(135deg, #EF4444, #F97316)',
        textColor: '#FECACA',
      };
    case 'success':
      return {
        background: 'linear-gradient(135deg, rgba(6, 78, 59, 0.95) 0%, var(--app-bg) 100%)',
        borderColor: 'rgba(16, 185, 129, 0.35)',
        iconBg: 'linear-gradient(135deg, #10B981, #34D399)',
        textColor: '#BBF7D0',
      };
    case 'warning':
      return {
        background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.95) 0%, var(--app-bg) 100%)',
        borderColor: 'rgba(245, 158, 11, 0.35)',
        iconBg: 'linear-gradient(135deg, #F59E0B, #F97316)',
        textColor: '#FDE68A',
      };
    default:
      return {
        background: 'linear-gradient(135deg, #1E3A5F 0%, var(--app-bg) 100%)',
        borderColor: 'rgba(30, 64, 175, 0.2)',
        iconBg: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
        textColor: '#93C5FD',
      };
  }
}

export function DoraInsightBar({ module, className, fallback }: DoraInsightBarProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [insights, setInsights] = useState<DoraRealtimeInsight[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [dismissedFallback, setDismissedFallback] = useState(() => isDismissed(module));
  const [criticalPulse, setCriticalPulse] = useState(false);
  const pulseTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setDismissedFallback(isDismissed(module));
    setInsights([]);
    setLoaded(false);
  }, [module]);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `${API_ORIGIN}/api/dora/insights?module=${module}&limit=3&unreadOnly=true`,
          { credentials: 'include', headers: buildHeaders(userId), signal: controller.signal },
        );

        if (!res.ok) throw new Error(res.statusText);

        const data = await res.json();
        const nextInsights = Array.isArray(data?.insights) ? data.insights : [];
        setInsights(nextInsights.slice(0, 3));
        setLoaded(true);
      } catch {
        if (!controller.signal.aborted) {
          setInsights([]);
          setLoaded(true);
        }
      }
    })();

    return () => controller.abort();
  }, [module, userId]);

  useEffect(() => {
    const unsubscribe = onDoraNewInsight((incoming) => {
      if (normalizeInsightModule(incoming.module) !== module) return;

      setInsights((current) => {
        const deduped = current.filter((item) => item.id !== incoming.id);
        return [incoming, ...deduped].slice(0, 3);
      });

      if (incoming.severity === 'critical') {
        setCriticalPulse(true);
        if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
        pulseTimerRef.current = setTimeout(() => setCriticalPulse(false), 2000);
      }
    });

    return () => {
      unsubscribe();
      if (pulseTimerRef.current) clearTimeout(pulseTimerRef.current);
    };
  }, [module]);

  if (!loaded) return null;

  const fallbackInsight = {
    id: `fallback-${module}`,
    module,
    severity: 'fallback' as const,
    title: 'Dora',
    message: fallback || FALLBACK_MESSAGES[module],
    actionUrl: undefined,
    actionLabel: undefined,
  };
  const visibleInsights = insights.length > 0
    ? insights
    : dismissedFallback
      ? []
      : [fallbackInsight];

  if (visibleInsights.length === 0) return null;

  const handleFallbackDismiss = () => {
    try {
      localStorage.setItem(getDismissKey(module), String(Date.now()));
    } catch {
      /* localStorage unavailable */
    }
    setDismissedFallback(true);
  };

  const handleInsightDismiss = async (insightId: string) => {
    try {
      const res = await fetch(`${API_ORIGIN}/api/dora/insights/${insightId}/dismiss`, {
        method: 'PUT',
        credentials: 'include',
        headers: buildHeaders(userId),
      });
      if (!res.ok) throw new Error(res.statusText);
      setInsights((current) => current.filter((item) => item.id !== insightId));
    } catch {
      /* fail silently and keep the insight visible */
    }
  };

  return (
    <div data-testid="onboarding-insight-bar" className={cn('mb-4 space-y-2', className)}>
      <AnimatePresence initial={false}>
        {visibleInsights.map((insight) => {
          const styles = getBarStyles(insight.severity);
          const isFallbackInsight = insight.id === fallbackInsight.id;

          return (
            <motion.div
              key={insight.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={MOTION.presets.normal}
              className="rounded-lg border p-3 px-4 flex items-center gap-3"
              style={{
                background: styles.background,
                borderColor: styles.borderColor,
              }}
            >
              <motion.div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-app-text text-xs"
                style={{ background: styles.iconBg }}
                animate={criticalPulse && insight.severity === 'critical'
                  ? { boxShadow: ['0 0 0 rgba(239,68,68,0)', '0 0 18px rgba(239,68,68,0.7)', '0 0 0 rgba(239,68,68,0)'] }
                  : { boxShadow: '0 0 0 rgba(0,0,0,0)' }}
                transition={{ duration: 2, ease: 'easeOut' }}
                aria-hidden="true"
              >
                ✦
              </motion.div>

              <div className="flex-1 min-w-0">
                {!isFallbackInsight && (
                  <p className="text-[11px] uppercase tracking-wide font-semibold mb-1" style={{ color: styles.textColor }}>
                    {insight.title}
                  </p>
                )}
                <p className="text-[13px]" style={{ color: styles.textColor }}>
                  {insight.message}
                </p>
              </div>

              {!isFallbackInsight && insight.actionUrl && insight.actionLabel && (
                <button
                  type="button"
                  onClick={() => navigate(insight.actionUrl!)}
                  className="text-[11px] font-medium text-app-text/90 hover:text-app-text shrink-0"
                >
                  {insight.actionLabel}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  if (isFallbackInsight) handleFallbackDismiss();
                  else void handleInsightDismiss(insight.id);
                }}
                className="text-[11px] text-app-muted hover:text-app-text cursor-pointer shrink-0 transition-colors duration-fast"
              >
                Dismiss
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

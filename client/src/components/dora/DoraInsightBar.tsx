import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MOTION } from '@/styles/design-tokens';
import { API_ORIGIN } from '@/lib/api';
import { getAccessToken } from '@/lib/authToken';
import { cn } from '@/lib/utils';

type Module =
  | 'dashboard'
  | 'finance'
  | 'projects'
  | 'knowledge'
  | 'team'
  | 'chat'
  | 'achievements';

interface DoraInsightBarProps {
  module: Module;
  className?: string;
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

export function DoraInsightBar({ module, className }: DoraInsightBarProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(() => isDismissed(module));

  useEffect(() => {
    if (dismissed) return;

    const controller = new AbortController();

    (async () => {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        const token = getAccessToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(
          `${API_ORIGIN}/api/dora/insights?module=${module}&limit=1`,
          { headers, signal: controller.signal },
        );

        if (!res.ok) throw new Error(res.statusText);

        const data = await res.json();
        const text =
          data?.insights?.[0]?.message ??
          data?.message ??
          data?.[0]?.message;

        setMessage(text || FALLBACK_MESSAGES[module]);
      } catch {
        if (!controller.signal.aborted) {
          setMessage(FALLBACK_MESSAGES[module]);
        }
      }
    })();

    return () => controller.abort();
  }, [module, dismissed]);

  if (dismissed || message === null) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem(getDismissKey(module), String(Date.now()));
    } catch {
      /* localStorage unavailable */
    }
    setDismissed(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION.presets.normal}
      className={cn(
        'rounded-lg border p-3 px-4 mb-4 flex items-center gap-3',
        className,
      )}
      style={{
        background: 'linear-gradient(135deg, #1E3A5F 0%, var(--app-bg) 100%)',
        borderColor: 'rgba(30, 64, 175, 0.2)',
      }}
    >
      {/* Dora icon */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-xs"
        style={{ background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)' }}
        aria-hidden="true"
      >
        ✦
      </div>

      {/* Insight text */}
      <p className="flex-1 text-[13px]" style={{ color: '#93C5FD' }}>
        {message}
      </p>

      {/* Dismiss */}
      <button
        type="button"
        onClick={handleDismiss}
        className="text-[11px] text-app-muted hover:text-app-text cursor-pointer shrink-0 transition-colors duration-fast"
      >
        Dismiss
      </button>
    </motion.div>
  );
}

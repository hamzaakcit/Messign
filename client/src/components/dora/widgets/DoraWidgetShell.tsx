import type { ReactNode } from 'react';

export interface DoraWidgetShellProps {
  title: string;
  icon?: ReactNode;
  subtitle?: string;
  accentGradient?: string;
  children: ReactNode;
  delay?: number;
  /** Extra actions (e.g. export) in header row */
  actions?: ReactNode;
}

/**
 * Shared chrome for Dora widgets — matches FinancialSummary-style top bar + glass card.
 */
export function DoraWidgetShell({
  title,
  icon,
  subtitle,
  accentGradient = 'linear-gradient(90deg, #38bdf8, #8b5cf6)',
  children,
  delay = 0,
  actions,
}: DoraWidgetShellProps) {
  return (
    <div
      className="dora-fade-up dora-glass dora-glow-border"
      style={{
        borderRadius: 'var(--dora-r-widget, 16px)',
        overflow: 'hidden',
        animationDelay: `${delay}s`,
        opacity: delay > 0 ? 0 : undefined,
        marginTop: 12,
      }}
    >
      <div style={{ height: 3, background: accentGradient, opacity: 0.55 }} />
      <div style={{ padding: '14px 16px 12px' }}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h3
              className="dora-font flex items-center gap-2"
              style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', margin: 0 }}
            >
              {icon}
              {title}
            </h3>
            {subtitle && (
              <p className="text-[11px] text-white/40 mt-0.5 mb-0">{subtitle}</p>
            )}
          </div>
          {actions}
        </div>
        {children}
      </div>
    </div>
  );
}

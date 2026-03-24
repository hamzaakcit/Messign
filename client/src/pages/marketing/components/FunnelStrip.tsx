import { useState } from 'react';
import { ChevronRight, Filter, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { Lead, LeadFunnelMetrics } from '@/lib/marketingApi';

interface FunnelStripProps {
  funnel: LeadFunnelMetrics | null;
  hotLeads: Lead[];
  onLeadClick: (leadId: string) => void;
}

const STAGES: Array<{ key: keyof LeadFunnelMetrics; label: string; color: string }> = [
  { key: 'new', label: 'New', color: 'bg-blue-500 text-blue-100' },
  { key: 'contacted', label: 'Contacted', color: 'bg-sky-500 text-sky-100' },
  { key: 'nurturing', label: 'Nurturing', color: 'bg-amber-500 text-amber-100' },
  { key: 'qualified', label: 'Qualified', color: 'bg-emerald-500 text-emerald-100' },
  { key: 'converted', label: 'Won', color: 'bg-green-500 text-green-100' },
];

function scoreColor(score: number): string {
  if (score < 30) return 'bg-red-500';
  if (score < 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

export function FunnelStrip({ funnel, hotLeads, onLeadClick }: FunnelStripProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  if (!funnel) return <div />;

  const maxVal = Math.max(1, ...STAGES.map((s) => funnel[s.key] ?? 0));

  return (
    <div className="border-t border-app-border bg-app-surface-tertiary shrink-0">
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        className="flex items-center gap-3 w-full px-4 h-10 hover:bg-app-hover transition-colors"
      >
        <Filter className="w-3.5 h-3.5 text-app-muted shrink-0" />
        <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-x-auto no-scrollbar">
          {STAGES.map((stage, i) => (
            <span key={stage.key} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronRight className="w-2.5 h-2.5 text-app-text/20" />}
              <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold', stage.color)}>
                {funnel[stage.key] ?? 0}
              </span>
              <span className="text-[10px] text-app-muted hidden sm:inline">{stage.label}</span>
            </span>
          ))}
        </div>
        {hotLeads.length > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400 shrink-0">
            <TrendingUp className="w-3 h-3" />
            {hotLeads.length} hot
          </span>
        )}
        <ChevronRight
          className={cn(
            'w-3.5 h-3.5 text-app-muted transition-transform shrink-0',
            expanded && 'rotate-90',
          )}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-1">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
                {STAGES.map((stage) => {
                  const value = funnel[stage.key] ?? 0;
                  return (
                    <div key={stage.key} className="rounded-lg border border-app-border bg-app-surface-tertiary p-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] uppercase tracking-wide text-app-muted">{stage.label}</span>
                        <span className="text-sm font-semibold text-app-text">{value}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-app-surface-tertiary overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', stage.color.split(' ')[0])}
                          style={{ width: `${(value / maxVal) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {hotLeads.length > 0 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                  {hotLeads.slice(0, 8).map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => onLeadClick(lead.id)}
                      className="flex items-center gap-2 shrink-0 rounded-lg border border-app-border bg-app-surface-tertiary px-3 py-2 hover:bg-app-hover transition-colors min-w-0"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-app-text truncate max-w-[120px]">
                          {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email}
                        </p>
                        <p className="text-[10px] text-app-muted truncate max-w-[120px]">
                          {lead.company_name || lead.source}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="w-8 h-1.5 rounded-full bg-app-surface-tertiary overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', scoreColor(lead.score))}
                            style={{ width: `${Math.min(lead.score, 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-medium text-app-muted">{lead.score}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

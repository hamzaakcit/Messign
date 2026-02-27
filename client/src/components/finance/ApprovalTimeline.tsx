import { cn } from '@/lib/utils';
import { CheckCircle, XCircle, Clock, ArrowRight, Shield } from 'lucide-react';
import { AIScoreBadge } from './AIScoreBadge';

interface ApprovalStep {
  id: string;
  step_order: number;
  step_name?: string;
  step_type?: string;
  approver_name?: string;
  status: string;
  decision_at?: string;
  decision_notes?: string;
  ai_recommendation?: string;
  ai_confidence?: number;
  escalated_at?: string;
  delegated_to_name?: string;
}

interface ApprovalTimelineProps {
  steps: ApprovalStep[];
  className?: string;
}

export function ApprovalTimeline({ steps, className }: ApprovalTimelineProps) {
  if (steps.length === 0) {
    return <p className="text-sm text-app-muted">No approval steps configured.</p>;
  }

  return (
    <div className={cn('space-y-1', className)}>
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const statusIcon = step.status === 'approved'
          ? <CheckCircle className="h-5 w-5 text-emerald-400" />
          : step.status === 'rejected'
          ? <XCircle className="h-5 w-5 text-red-400" />
          : <Clock className="h-5 w-5 text-amber-400" />;

        return (
          <div key={step.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              {statusIcon}
              {!isLast && <div className="w-px h-full bg-white/10 min-h-[24px]" />}
            </div>
            <div className="pb-4 flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-app-text">
                    {step.step_name ?? step.step_type?.replace(/_/g, ' ')}
                  </span>
                  {step.approver_name && (
                    <span className="text-xs text-app-muted ml-2">{step.approver_name}</span>
                  )}
                  {step.delegated_to_name && (
                    <span className="text-xs text-amber-400 ml-2 flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" /> Delegated to {step.delegated_to_name}
                    </span>
                  )}
                </div>
                {step.decision_at && (
                  <span className="text-xs text-app-muted">
                    {new Date(step.decision_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
              {step.decision_notes && (
                <p className="text-xs text-app-muted mt-1 italic">"{step.decision_notes}"</p>
              )}
              {step.ai_recommendation && (
                <div className="flex items-center gap-2 mt-1.5">
                  <Shield className="h-3 w-3 text-primary-400" />
                  <span className="text-xs text-primary-400">AI: {step.ai_recommendation}</span>
                  {step.ai_confidence != null && (
                    <AIScoreBadge score={step.ai_confidence} showIcon={false} />
                  )}
                </div>
              )}
              {step.escalated_at && (
                <span className="text-xs text-red-400 mt-1 block">Escalated</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

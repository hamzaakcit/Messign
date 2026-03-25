import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/Button';

const triggerOptions = [
  { value: 'finance.expense.created', label: 'Finance: Expense Created' },
  { value: 'finance.expense.submitted', label: 'Finance: Expense Submitted' },
  { value: 'finance.invoice.overdue', label: 'Finance: Invoice Overdue' },
  { value: 'support.ticket.created', label: 'Support: Ticket Created' },
  { value: 'support.ticket.resolved', label: 'Support: Ticket Resolved' },
  { value: 'support.sla.breached', label: 'Support: SLA Breached' },
  { value: 'crm.deal.created', label: 'Sales: Deal Created' },
  { value: 'crm.deal.stage_changed', label: 'Sales: Deal Stage Changed' },
  { value: 'crm.deal.won', label: 'Sales: Deal Won' },
  { value: 'crm.deal.lost', label: 'Sales: Deal Lost' },
  { value: 'project.task.completed', label: 'Projects: Task Completed' },
  { value: 'project.sprint.completed', label: 'Projects: Sprint Completed' },
];

const actionOptions = [
  { value: 'finance:approve_expense', label: 'Approve Expense' },
  { value: 'reject_expense', label: 'Reject Expense' },
  { value: 'assign_ticket', label: 'Assign Ticket' },
  { value: 'close_ticket_after_delay', label: 'Close Ticket' },
  { value: 'send_notification', label: 'Send Notification' },
  { value: 'projects:create_task', label: 'Create Task' },
];

type FormShape = {
  name: string;
  description: string;
  triggerEvent: string;
  conditionField: string;
  conditionOperator: string;
  conditionValue: string;
  actionType: string;
  actionParams: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  scope: 'personal' | 'team' | 'department' | 'organization';
};

interface PolicyBuilderPanelProps {
  onCancel: () => void;
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
}

export function PolicyBuilderPanel({ onCancel, onCreate }: PolicyBuilderPanelProps) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, watch } = useForm<FormShape>({
    defaultValues: {
      name: '',
      description: '',
      triggerEvent: 'finance.expense.submitted',
      conditionField: 'amount',
      conditionOperator: 'lte',
      conditionValue: '',
      actionType: 'finance:approve_expense',
      actionParams: '{}',
      riskLevel: 'medium',
      scope: 'team',
    },
  });

  const values = watch();
  const englishSummary = useMemo(() => {
    const condText = values.conditionValue
      ? `${values.conditionField} ${values.conditionOperator} ${values.conditionValue}`
      : 'no additional conditions';
    return `When ${values.triggerEvent} occurs, if ${condText}, Dora will ${values.actionType} (${values.riskLevel} risk, ${values.scope} scope).`;
  }, [values]);

  const submit = handleSubmit(async (data) => {
    setSubmitting(true);
    try {
      const conditions = data.conditionValue
        ? [{
            field: data.conditionField,
            operator: data.conditionOperator,
            value: Number.isFinite(Number(data.conditionValue)) ? Number(data.conditionValue) : data.conditionValue,
          }]
        : [];
      let parsedParams: Record<string, unknown> = {};
      try {
        parsedParams = data.actionParams ? JSON.parse(data.actionParams) as Record<string, unknown> : {};
      } catch {
        parsedParams = { raw: data.actionParams };
      }
      await onCreate({
        name: data.name,
        description: data.description,
        triggerEvent: data.triggerEvent,
        conditions,
        actionType: data.actionType,
        actionParams: parsedParams,
        riskLevel: data.riskLevel,
        scope: data.scope,
      });
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form onSubmit={submit} className="space-y-5 p-5">
      <div className="text-xs text-app-muted">Step {step} of 5</div>

      {step === 1 && (
        <div className="space-y-4">
          <input {...register('name', { required: true })} placeholder="Policy name" className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app" />
          <textarea {...register('description')} placeholder="Description" className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app" rows={3} />
          <select {...register('triggerEvent')} className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app">
            {triggerOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <input {...register('conditionField')} placeholder="field" className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app" />
            <select {...register('conditionOperator')} className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app">
              {['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'in'].map((op) => <option key={op} value={op}>{op}</option>)}
            </select>
            <input {...register('conditionValue')} placeholder="value" className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app" />
          </div>
          <p className="text-xs text-app-muted">AND logic can be extended later; this creates one condition row now.</p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <select {...register('actionType')} className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app">
            {actionOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <textarea {...register('actionParams')} rows={4} className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 font-mono text-xs text-app" />
        </div>
      )}

      {step === 4 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <select {...register('riskLevel')} className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app">
            <option value="low">Low - execute immediately</option>
            <option value="medium">Medium - execute with undo window</option>
            <option value="high">High - queue for approval</option>
            <option value="critical">Critical - do not auto execute</option>
          </select>
          <select {...register('scope')} className="rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app">
            <option value="personal">Personal</option>
            <option value="team">Team</option>
            <option value="department">Department</option>
            <option value="organization">Organization</option>
          </select>
        </div>
      )}

      {step === 5 && (
        <div className="rounded-lg border border-app-border bg-app-card p-4 text-sm text-app">
          {englishSummary}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button type="button" variant="secondary" onClick={step === 1 ? onCancel : () => setStep((s) => Math.max(1, s - 1))}>
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>
        {step < 5 ? (
          <Button type="button" onClick={() => setStep((s) => Math.min(5, s + 1))}>Next</Button>
        ) : (
          <Button type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create Policy'}</Button>
        )}
      </div>
    </form>
  );
}

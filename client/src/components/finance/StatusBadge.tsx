import { cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: 'text-gray-400', bg: 'bg-gray-500/20' },
  submitted: { label: 'Submitted', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  ai_reviewing: { label: 'AI Reviewing', color: 'text-purple-400', bg: 'bg-purple-500/20' },
  ai_approved: { label: 'AI Approved', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  ai_flagged: { label: 'AI Flagged', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  manager_review: { label: 'Manager Review', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  manager_approved: { label: 'Manager Approved', color: 'text-green-400', bg: 'bg-green-500/20' },
  manager_rejected: { label: 'Manager Rejected', color: 'text-red-400', bg: 'bg-red-500/20' },
  finance_review: { label: 'Finance Review', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  finance_approved: { label: 'Finance Approved', color: 'text-green-400', bg: 'bg-green-500/20' },
  finance_rejected: { label: 'Finance Rejected', color: 'text-red-400', bg: 'bg-red-500/20' },
  approved: { label: 'Approved', color: 'text-green-400', bg: 'bg-green-500/20' },
  rejected: { label: 'Rejected', color: 'text-red-400', bg: 'bg-red-500/20' },
  processing: { label: 'Processing', color: 'text-teal-400', bg: 'bg-teal-500/20' },
  payment_processing: { label: 'Processing', color: 'text-teal-400', bg: 'bg-teal-500/20' },
  failed: { label: 'Failed', color: 'text-red-400', bg: 'bg-red-500/20' },
  paid: { label: 'Paid', color: 'text-teal-400', bg: 'bg-teal-500/20' },
  reimbursed: { label: 'Reimbursed', color: 'text-teal-400', bg: 'bg-teal-500/20' },
  voided: { label: 'Voided', color: 'text-gray-500', bg: 'bg-gray-500/20' },
  overdue: { label: 'Overdue', color: 'text-red-400', bg: 'bg-red-500/20' },
  sent: { label: 'Sent', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  partially_paid: { label: 'Partially Paid', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  active: { label: 'Active', color: 'text-green-400', bg: 'bg-green-500/20' },
  frozen: { label: 'Frozen', color: 'text-blue-300', bg: 'bg-blue-500/20' },
  closed: { label: 'Closed', color: 'text-gray-400', bg: 'bg-gray-500/20' },
  pending: { label: 'Pending', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  completed: { label: 'Completed', color: 'text-green-400', bg: 'bg-green-500/20' },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? {
    label: status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    color: 'text-gray-400',
    bg: 'bg-gray-500/20',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        config.bg,
        config.color,
        className,
      )}
    >
      {config.label}
    </span>
  );
}

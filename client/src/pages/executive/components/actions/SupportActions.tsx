import { useEffect, useState, useCallback } from 'react';
import { Loader2, UserCheck, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supportApi } from '@/lib/api';

interface Ticket {
  id: string;
  subject?: string;
  ticket_number?: string;
  priority: string;
  status: string;
  assignee_name?: string;
  created_at?: string;
}

interface SupportActionsProps {
  userId: string;
  onSuccess: () => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-green-400',
};

export function SupportActions({ userId, onSuccess }: SupportActionsProps): JSX.Element {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      const result = await supportApi.listTickets(userId, { status: 'open' as never });
      const items = (result as { data?: Ticket[] })?.data ?? [];
      setTickets(Array.isArray(items) ? items.slice(0, 10) : []);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const handleClose = async (ticketId: string): Promise<void> => {
    setActing(ticketId);
    try {
      await supportApi.updateTicket(userId, ticketId, { status: 'resolved' } as never);
      toast.success('Ticket resolved');
      setTickets((prev) => prev.filter((t) => t.id !== ticketId));
      onSuccess();
    } catch {
      toast.error('Failed to resolve ticket');
    } finally {
      setActing(null);
    }
  };

  const handleAssign = async (ticketId: string): Promise<void> => {
    setActing(ticketId);
    try {
      await supportApi.assignTicket(userId, ticketId, { assignee_id: userId } as never);
      toast.success('Ticket assigned to you');
      loadTickets();
      onSuccess();
    } catch {
      toast.error('Failed to assign ticket');
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-app-muted" /></div>;
  }

  if (tickets.length === 0) {
    return <div className="text-center py-8 text-app-muted text-sm">No open tickets</div>;
  }

  return (
    <div className="space-y-2" data-testid="support-actions">
      {tickets.map((ticket) => (
        <div key={ticket.id} className="flex items-center justify-between p-3 rounded-lg border border-app bg-app hover:bg-app-hover transition-colors">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-app truncate">{ticket.subject || `#${ticket.ticket_number}`}</div>
            <div className="text-xs text-app-muted">
              <span className={PRIORITY_COLORS[ticket.priority] ?? 'text-app-muted'}>{ticket.priority}</span>
              {ticket.assignee_name && ` · ${ticket.assignee_name}`}
            </div>
          </div>
          <div className="flex items-center gap-1.5 ml-3">
            <button
              onClick={() => handleAssign(ticket.id)}
              disabled={acting === ticket.id}
              className="p-1.5 rounded-md bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
              title="Assign to me"
            >
              {acting === ticket.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
            </button>
            <button
              onClick={() => handleClose(ticket.id)}
              disabled={acting === ticket.id}
              className="p-1.5 rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
              title="Resolve"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

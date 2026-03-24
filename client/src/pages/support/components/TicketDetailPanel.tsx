import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bot,
  ChevronDown,
  ChevronUp,
  Clock3,
  ExternalLink,
  LifeBuoy,
  MessageSquare,
  Paperclip,
  Send,
  ShieldAlert,
  Sparkles,
  UserCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/authStore';
import { useUsersStore } from '@/stores/usersStore';
import {
  supportApi,
  type SupportCategory,
  type SupportCustomerHealth,
  type SupportMessage,
  type SupportPriority,
  type SupportStatus,
  type SupportTicket,
} from '@/lib/supportApi';
import { cn, formatDate, formatRelativeTime } from '@/lib/utils';
import {
  formatHoursShort,
  formatTicketStamp,
  HealthScoreBadge,
  PriorityBadge,
  RelativeStamp,
  SlaBar,
  TicketAssigneeValue,
  TicketStatusBadge,
  TimelineMarker,
} from './supportUi';

interface TicketDetailPanelProps {
  ticketId: string;
  onClose: () => void;
  onUpdated: () => void;
}

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500';

function makeAttachmentPayload(files: File[]) {
  return files.map((file) => ({
    filename: file.name,
    size: file.size,
    type: file.type,
  }));
}

function DetailSkeleton() {
  return (
    <div className="p-6 space-y-5 animate-pulse">
      <div className="space-y-3">
        <div className="h-5 bg-app-surface-tertiary rounded w-28" />
        <div className="h-8 bg-app-surface-tertiary rounded w-3/4" />
        <div className="h-5 bg-app-surface-tertiary rounded w-40" />
      </div>
      <div className="grid grid-cols-1 gap-3">
        <div className="h-28 rounded-xl bg-app-surface-tertiary" />
        <div className="h-28 rounded-xl bg-app-surface-tertiary" />
      </div>
      <div className="h-48 rounded-xl bg-app-surface-tertiary" />
      <div className="space-y-3">
        <div className="h-24 rounded-xl bg-app-surface-tertiary" />
        <div className="h-20 rounded-xl bg-app-surface-tertiary" />
      </div>
    </div>
  );
}

function describeTimelineChange(fieldName: string, oldValue: string | null, newValue: string | null): string {
  const label = fieldName.replace(/_/g, ' ');
  if (!oldValue && newValue) return `${label} set to ${newValue}`;
  if (oldValue && !newValue) return `${label} cleared`;
  if (oldValue && newValue) return `${label} changed from ${oldValue} to ${newValue}`;
  return `${label} updated`;
}

function MessageBubble({
  message,
  reporterEmail,
}: {
  message: SupportMessage;
  reporterEmail: string;
}) {
  const isInternal = message.isInternalNote;
  const isCustomer = !isInternal && !!message.authorEmail && message.authorEmail === reporterEmail;

  return (
    <div className={cn('flex', isCustomer ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl border px-4 py-3',
          isInternal && 'bg-amber-500/10 border-amber-500/30 border-dashed',
          isCustomer && 'bg-blue-500/10 border-blue-500/20',
          !isCustomer && !isInternal && 'bg-app-surface-tertiary border-app-border',
        )}
      >
        <div className="flex items-center gap-2 text-xs mb-1">
          <span className="font-medium text-app-text">
            {message.authorName || message.authorEmail || 'Support team'}
          </span>
          {isInternal && <Badge variant="orange">Internal Note</Badge>}
          <span className="text-app-muted">{formatRelativeTime(message.createdAt)}</span>
        </div>
        <p className="text-sm text-app-text whitespace-pre-wrap">{message.body}</p>
        {message.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.attachments.map((attachment, index) => {
              const label =
                String(attachment.filename ?? attachment.name ?? `Attachment ${index + 1}`);
              return (
                <Badge key={`${label}-${index}`} variant="default" className="gap-1.5">
                  <Paperclip className="w-3 h-3" />
                  {label}
                </Badge>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function TicketDetailPanel({ ticketId, onClose, onUpdated }: TicketDetailPanelProps) {
  const { user } = useAuthStore();
  const { users } = useUsersStore();
  const navigate = useNavigate();
  const userId = user?.authUserId || user?.id || '';

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [categories, setCategories] = useState<SupportCategory[]>([]);
  const [health, setHealth] = useState<SupportCustomerHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [internalNote, setInternalNote] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);

  const fetchTicket = useCallback(async () => {
    if (!userId || !ticketId) return;
    setLoading(true);
    try {
      const nextTicket = await supportApi.getTicket(userId, ticketId);
      setTicket(nextTicket);
      if (nextTicket.crmCompanyId) {
        supportApi
          .getCustomerHealth(userId, nextTicket.crmCompanyId)
          .then(setHealth)
          .catch(() => setHealth(null));
      } else {
        setHealth(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [ticketId, userId]);

  useEffect(() => {
    fetchTicket();
  }, [fetchTicket]);

  useEffect(() => {
    if (!userId) return;
    supportApi.listCategories(userId).then(setCategories).catch(() => setCategories([]));
  }, [userId]);

  const availableAssignees = useMemo(
    () => users.filter((entry) => ['admin', 'manager', 'member'].includes(entry.role)),
    [users],
  );

  const runMutation = async (task: () => Promise<unknown>, successMessage: string) => {
    setActionLoading(true);
    try {
      await task();
      toast.success(successMessage);
      await fetchTicket();
      onUpdated();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Update failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReply = async () => {
    if (!ticket || !reply.trim() || !userId) return;
    await runMutation(async () => {
      if (internalNote) {
        await supportApi.addInternalNote(userId, ticket.id, reply.trim());
      } else {
        await supportApi.addMessage(userId, ticket.id, {
          body: reply.trim(),
          attachments: makeAttachmentPayload(attachments),
        });
      }
      setReply('');
      setAttachments([]);
      setInternalNote(false);
    }, internalNote ? 'Internal note added' : 'Reply sent');
  };

  const handleAcceptCategory = async () => {
    if (!ticket?.doraCategorySuggestion || !ticket || !userId) return;
    const match = categories.find(
      (category) =>
        category.name.toLowerCase() === ticket.doraCategorySuggestion?.toLowerCase(),
    );
    if (!match) {
      toast.info('No matching support category found for the suggestion.');
      return;
    }
    await runMutation(
      () => supportApi.updateTicket(userId, ticket.id, { categoryId: match.id }),
      'Suggested category applied',
    );
  };

  if (loading || !ticket) return <DetailSkeleton />;

  const firstResponseSummary = ticket.firstResponseTimeHours != null
    ? `Responded in ${formatHoursShort(ticket.firstResponseTimeHours)} / ${formatHoursShort(ticket.slaDetails?.firstResponse.totalHours)} SLA`
    : `Awaiting first response — ${formatHoursShort(ticket.slaDetails?.firstResponse.elapsedHours)} of ${formatHoursShort(ticket.slaDetails?.firstResponse.totalHours)} elapsed`;

  const resolutionSummary = ticket.resolutionTimeHours != null
    ? `Resolved in ${formatHoursShort(ticket.resolutionTimeHours)} / ${formatHoursShort(ticket.slaDetails?.resolution.totalHours)} SLA`
    : `Resolution target: ${formatHoursShort(ticket.slaDetails?.resolution.elapsedHours)} of ${formatHoursShort(ticket.slaDetails?.resolution.totalHours)} elapsed`;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="blue">{formatTicketStamp(ticket.ticketNumber)}</Badge>
            <TicketStatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
          </div>
          <h3 className="text-2xl font-semibold text-app-text">{ticket.subject}</h3>
          <p className="text-sm text-app-muted mt-2">
            Created <RelativeStamp value={ticket.createdAt} /> by {ticket.reporterName || ticket.reporterEmail}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <SlaBar label="First Response SLA" detail={ticket.slaDetails?.firstResponse} summary={firstResponseSummary} />
          <SlaBar label="Resolution SLA" detail={ticket.slaDetails?.resolution} summary={resolutionSummary} />
        </div>

        <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5">
          <div className="flex items-center gap-2 mb-4">
            <UserCircle2 className="w-4 h-4 text-primary-400" />
            <h4 className="font-semibold text-app-text">Customer</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-app-muted mb-1">Reporter</p>
              <p className="text-app-text font-medium">{ticket.reporterName || 'Unknown reporter'}</p>
              <p className="text-app-muted">{ticket.reporterEmail}</p>
            </div>
            <div>
              <p className="text-app-muted mb-1">Assignee</p>
              <TicketAssigneeValue assigneeName={ticket.assigneeName} />
            </div>
            <div className="flex items-center gap-2">
              <div>
                <p className="text-app-muted mb-1">Company</p>
                {ticket.crmCompanyId ? (
                  <button
                    type="button"
                    onClick={() => {
                      navigate('/crm/companies');
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300"
                  >
                    {ticket.companyName || 'View company'}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <p className="text-app-text">Not linked</p>
                )}
              </div>
              {health && <HealthScoreBadge score={health.healthScore} />}
            </div>
            <div>
              <p className="text-app-muted mb-1">Contact</p>
              {ticket.crmContactId ? (
                <button
                  type="button"
                  onClick={() => {
                    navigate('/crm/contacts');
                    onClose();
                  }}
                  className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300"
                >
                  View CRM contact
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              ) : (
                <p className="text-app-text">Not linked</p>
              )}
            </div>
          </div>
        </div>

        {(ticket.doraCategorySuggestion || ticket.doraSentiment) && (
          <div className="rounded-xl border border-primary-500/20 p-5 bg-[linear-gradient(135deg,rgba(30,58,95,0.95),rgba(17,24,39,0.95))]">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary-300" />
              <h4 className="font-semibold text-primary-100">Dora AI</h4>
            </div>
            <div className="space-y-3 text-sm">
              {ticket.doraCategorySuggestion && (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-primary-200">Suggested category</p>
                    <p className="text-app-text font-medium">{ticket.doraCategorySuggestion}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={handleAcceptCategory}>
                      Accept
                    </Button>
                    <Button size="sm" variant="ghost">
                      Reject
                    </Button>
                  </div>
                </div>
              )}
              {ticket.doraSentiment && (
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-primary-300" />
                  <span className="text-primary-200">Detected sentiment:</span>
                  <Badge variant={ticket.doraSentiment === 'urgent' ? 'red' : 'blue'}>
                    {ticket.doraSentiment}
                  </Badge>
                </div>
              )}
              <div className="flex items-center gap-2 text-primary-200">
                <LifeBuoy className="w-4 h-4" />
                <span>Suggested KB article:</span>
                <Link
                  to={`/knowledge-hub?query=${encodeURIComponent(ticket.subject)}`}
                  className="text-primary-300 hover:text-primary-200"
                >
                  Search Knowledge Hub
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-primary-400" />
            <h4 className="font-semibold text-app-text">Conversation</h4>
          </div>

          <div className="space-y-3 mb-4">
            {(ticket.messages ?? []).length === 0 ? (
              <p className="text-sm text-app-muted">No messages yet.</p>
            ) : (
              ticket.messages?.map((message) => (
                <MessageBubble key={message.id} message={message} reporterEmail={ticket.reporterEmail} />
              ))
            )}
          </div>

          <div className="rounded-xl border border-app-border bg-app-bg p-4 space-y-3">
            <textarea
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={4}
              placeholder={internalNote ? 'Add an internal note…' : 'Reply to the customer…'}
              className={inputClass}
            />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-app-text">
                  <input
                    type="checkbox"
                    checked={internalNote}
                    onChange={(event) => setInternalNote(event.target.checked)}
                    className="w-4 h-4"
                  />
                  Internal Note
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-app-muted cursor-pointer">
                  <Paperclip className="w-4 h-4" />
                  Attach files
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => setAttachments(Array.from(event.target.files ?? []))}
                  />
                </label>
              </div>
              <Button
                onClick={handleReply}
                isLoading={actionLoading}
                disabled={!reply.trim()}
              >
                <Send className="w-4 h-4" />
                {internalNote ? 'Add Note' : 'Reply'}
              </Button>
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((file) => (
                  <Badge key={`${file.name}-${file.size}`} variant="default">
                    {file.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-app-border bg-app-surface-tertiary p-5">
          <button
            type="button"
            onClick={() => setHistoryOpen((current) => !current)}
            className="w-full flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <Clock3 className="w-4 h-4 text-primary-400" />
              <h4 className="font-semibold text-app-text">History Timeline</h4>
            </div>
            {historyOpen ? <ChevronUp className="w-4 h-4 text-app-muted" /> : <ChevronDown className="w-4 h-4 text-app-muted" />}
          </button>
          {historyOpen && (
            <div className="mt-4">
              {(ticket.history ?? []).length === 0 ? (
                <p className="text-sm text-app-muted">No ticket history yet.</p>
              ) : (
                <div className="space-y-0">
                  {ticket.history?.map((entry, index) => (
                    <div key={entry.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <TimelineMarker emphasized={index === 0} />
                        {index < (ticket.history?.length ?? 0) - 1 && <div className="w-px flex-1 bg-app-surface-tertiary my-1" />}
                      </div>
                      <div className="pb-4 min-w-0 flex-1">
                        <p className="text-sm text-app-text">
                          {describeTimelineChange(entry.fieldName, entry.oldValue, entry.newValue)}
                        </p>
                        <p className="text-xs text-app-muted mt-1">
                          {formatDate(entry.changedAt)}
                          {entry.changedByName ? ` by ${entry.changedByName}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-app-border p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            value={ticket.assigneeId ?? ''}
            onChange={(event) => {
              const assigneeId = event.target.value;
              runMutation(
                () => assigneeId
                  ? supportApi.assignTicket(userId, ticket.id, assigneeId)
                  : supportApi.updateTicket(userId, ticket.id, { assigneeId: null }),
                'Assignee updated',
              );
            }}
            className={inputClass}
          >
            <option value="">Unassigned</option>
            {availableAssignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.name}
              </option>
            ))}
          </select>
          <select
            value={ticket.priority}
            onChange={(event) => {
              const priority = event.target.value as SupportPriority;
              runMutation(
                () => supportApi.updateTicket(userId, ticket.id, { priority }),
                'Priority updated',
              );
            }}
            className={inputClass}
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={ticket.status}
            onChange={(event) => {
              const status = event.target.value as SupportStatus;
              runMutation(
                () => supportApi.updateTicket(userId, ticket.id, { status }),
                'Status updated',
              );
            }}
            className={inputClass}
          >
            <option value="open">Open</option>
            <option value="awaiting_agent">Awaiting Agent</option>
            <option value="awaiting_customer">Awaiting Customer</option>
            <option value="in_progress">In Progress</option>
            <option value="on_hold">On Hold</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const reason = window.prompt('Escalation reason');
                if (!reason) return;
                runMutation(
                  () => supportApi.escalateTicket(userId, ticket.id, 'manager', reason),
                  'Ticket escalated',
                );
              }}
            >
              <ShieldAlert className="w-4 h-4" />
              Escalate
            </Button>
            {ticket.status !== 'resolved' && (
              <Button
                type="button"
                variant="primary"
                onClick={() => runMutation(
                  () => supportApi.updateTicket(userId, ticket.id, { status: 'resolved' }),
                  'Ticket resolved',
                )}
              >
                Resolve
              </Button>
            )}
            {ticket.status !== 'closed' && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => runMutation(
                  () => supportApi.updateTicket(userId, ticket.id, { status: 'closed' }),
                  'Ticket closed',
                )}
              >
                Close
              </Button>
            )}
            {(ticket.status === 'resolved' || ticket.status === 'closed') && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => runMutation(
                  () => supportApi.reopenTicket(userId, ticket.id),
                  'Ticket reopened',
                )}
              >
                Reopen
              </Button>
            )}
          </div>

          {ticket.csatRating && (
            <div className="text-sm text-app-muted">
              CSAT {ticket.csatRating.rating}/5
              {ticket.csatRating.comment ? ` • ${ticket.csatRating.comment}` : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

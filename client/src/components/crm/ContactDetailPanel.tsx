import { useState, useEffect } from 'react';
import { Mail, Phone, Briefcase, Building2, Calendar, MessageSquare } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { crmAPI, type Contact, type ActivityDetail, type Deal } from '@/lib/crmApi';

interface ContactDetailPanelProps {
  contactId: string;
  onUpdated?: () => void;
}

export function ContactDetailPanel({ contactId }: ContactDetailPanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !contactId) return;
    setLoading(true);
    crmAPI.getContact(userId, contactId)
      .then(setContact)
      .catch(() => setContact(null))
      .finally(() => setLoading(false));
  }, [userId, contactId]);

  if (loading) return <ContactDetailSkeleton />;
  if (!contact) return <div className="p-6 text-sm text-app-muted">Contact not found.</div>;

  const deals = contact.deals ?? [];
  const activities = contact.recent_activities ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Name & Title */}
      <div>
        <h3 className="text-xl font-semibold text-app-text">
          {contact.first_name} {contact.last_name ?? ''}
        </h3>
        {contact.job_title && (
          <p className="text-sm text-app-muted mt-0.5 flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5" />
            {contact.job_title}
          </p>
        )}
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 gap-3">
        {contact.email && (
          <InfoRow icon={Mail} label="Email" value={contact.email} />
        )}
        {contact.phone && (
          <InfoRow icon={Phone} label="Phone" value={contact.phone} />
        )}
        {contact.company_name && (
          <InfoRow icon={Building2} label="Company" value={contact.company_name} />
        )}
        {contact.source && (
          <InfoRow icon={MessageSquare} label="Source" value={contact.source} />
        )}
        {contact.last_contacted_at && (
          <InfoRow
            icon={Calendar}
            label="Last Contacted"
            value={new Date(contact.last_contacted_at).toLocaleDateString()}
          />
        )}
      </div>

      {/* Tags */}
      {contact.tags && contact.tags.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-2">Tags</h4>
          <div className="flex flex-wrap gap-1.5">
            {contact.tags.map(tag => (
              <span key={tag} className="px-2 py-0.5 rounded-full text-xs bg-primary-500/15 text-primary-400">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {contact.notes && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-2">Notes</h4>
          <p className="text-sm text-app-text whitespace-pre-wrap">{contact.notes}</p>
        </div>
      )}

      {/* Linked Deals */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-2">
          Linked Deals ({deals.length})
        </h4>
        {deals.length === 0 ? (
          <p className="text-sm text-app-muted">No linked deals.</p>
        ) : (
          <div className="space-y-2">
            {deals.map(deal => (
              <DealRow key={deal.id} deal={deal} />
            ))}
          </div>
        )}
      </div>

      {/* Activity Log */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-2">
          Recent Activity ({activities.length})
        </h4>
        {activities.length === 0 ? (
          <p className="text-sm text-app-muted">No activity logged.</p>
        ) : (
          <div className="space-y-2">
            {activities.map(act => (
              <ActivityRow key={act.id} activity={act} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className="w-4 h-4 text-app-muted shrink-0" />
      <span className="text-app-muted w-28 shrink-0">{label}</span>
      <span className="text-app-text">{value}</span>
    </div>
  );
}

function DealRow({ deal }: { deal: Deal }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-app-border bg-app-bg text-sm">
      <div>
        <span className="font-medium text-app-text">{deal.title}</span>
        {deal.stage_name && (
          <span className="ml-2 text-xs text-app-muted">{deal.stage_name}</span>
        )}
      </div>
      <span className="text-emerald-400 font-medium">
        {deal.currency ?? '$'}{Number(deal.amount).toLocaleString()}
      </span>
    </div>
  );
}

function ActivityRow({ activity }: { activity: ActivityDetail }) {
  const typeColors: Record<string, string> = {
    call: 'text-blue-400 bg-blue-500/15',
    email: 'text-amber-400 bg-amber-500/15',
    meeting: 'text-purple-400 bg-purple-500/15',
    note: 'text-app-muted bg-app-surface-tertiary',
    task: 'text-emerald-400 bg-emerald-500/15',
  };
  const cls = typeColors[activity.type] ?? typeColors.note;
  return (
    <div className="flex items-start gap-3 px-3 py-2 rounded-lg border border-app-border bg-app-bg text-sm">
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${cls}`}>
        {activity.type}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-app-text truncate">{activity.subject || 'No subject'}</p>
        <p className="text-xs text-app-muted mt-0.5">
          {new Date(activity.created_at).toLocaleDateString()}
          {activity.outcome && ` · ${activity.outcome}`}
        </p>
      </div>
    </div>
  );
}

function ContactDetailSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-6 bg-app-surface-tertiary rounded w-48" />
        <div className="h-4 bg-app-surface-tertiary rounded w-32" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-5 bg-app-surface-tertiary rounded w-full" />
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-app-surface-tertiary rounded w-24" />
        <div className="h-12 bg-app-surface-tertiary rounded w-full" />
        <div className="h-12 bg-app-surface-tertiary rounded w-full" />
      </div>
    </div>
  );
}

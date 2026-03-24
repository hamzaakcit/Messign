import { useState, useEffect } from 'react';
import { Globe, MapPin, Users, DollarSign, Building2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { crmAPI, type Company, type Contact, type Deal } from '@/lib/crmApi';

interface CompanyDetailPanelProps {
  companyId: string;
  onUpdated?: () => void;
}

export function CompanyDetailPanel({ companyId }: CompanyDetailPanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !companyId) return;
    setLoading(true);
    crmAPI.getCompany(userId, companyId)
      .then(setCompany)
      .catch(() => setCompany(null))
      .finally(() => setLoading(false));
  }, [userId, companyId]);

  if (loading) return <CompanyDetailSkeleton />;
  if (!company) return <div className="p-6 text-sm text-app-muted">Company not found.</div>;

  const contacts = company.contacts ?? [];
  const deals = company.deals ?? [];
  const totalDealValue = company.total_deal_value ?? deals.reduce((s, d) => s + Number(d.amount), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-xl font-semibold text-app-text flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary-400" />
          {company.name}
        </h3>
        {company.industry && (
          <p className="text-sm text-app-muted mt-0.5">{company.industry}</p>
        )}
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 gap-3">
        {company.domain && (
          <InfoRow icon={Globe} label="Domain" value={company.domain} />
        )}
        {company.size && (
          <InfoRow icon={Users} label="Size" value={company.size} />
        )}
        {company.annual_revenue != null && (
          <InfoRow
            icon={DollarSign}
            label="Annual Revenue"
            value={`$${Number(company.annual_revenue).toLocaleString()}`}
          />
        )}
        {(company.city || company.country) && (
          <InfoRow
            icon={MapPin}
            label="Location"
            value={[company.city, company.country].filter(Boolean).join(', ')}
          />
        )}
      </div>

      {/* Deal Value Summary */}
      <div className="rounded-lg border border-app-border bg-app-bg p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-app-muted">Total Deal Value</p>
          <p className="text-lg font-semibold text-emerald-400">
            ${Number(totalDealValue).toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-app-muted">Active Deals</p>
          <p className="text-lg font-semibold text-app-text">{company.deal_count ?? deals.length}</p>
        </div>
      </div>

      {/* Notes */}
      {company.notes && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-2">Notes</h4>
          <p className="text-sm text-app-text whitespace-pre-wrap">{company.notes}</p>
        </div>
      )}

      {/* Contacts */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-2">
          Contacts ({contacts.length})
        </h4>
        {contacts.length === 0 ? (
          <p className="text-sm text-app-muted">No contacts linked.</p>
        ) : (
          <div className="space-y-2">
            {contacts.map(contact => (
              <ContactRow key={contact.id} contact={contact} />
            ))}
          </div>
        )}
      </div>

      {/* Deals */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-app-muted mb-2">
          Deals ({deals.length})
        </h4>
        {deals.length === 0 ? (
          <p className="text-sm text-app-muted">No deals linked.</p>
        ) : (
          <div className="space-y-2">
            {deals.map(deal => (
              <DealRow key={deal.id} deal={deal} />
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

function ContactRow({ contact }: { contact: Contact }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-app-border bg-app-bg text-sm">
      <div>
        <span className="font-medium text-app-text">
          {contact.first_name} {contact.last_name ?? ''}
        </span>
        {contact.job_title && (
          <span className="ml-2 text-xs text-app-muted">{contact.job_title}</span>
        )}
      </div>
      {contact.email && (
        <span className="text-xs text-app-muted">{contact.email}</span>
      )}
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

function CompanyDetailSkeleton() {
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
      <div className="h-20 bg-app-surface-tertiary rounded w-full" />
      <div className="space-y-2">
        <div className="h-4 bg-app-surface-tertiary rounded w-24" />
        <div className="h-12 bg-app-surface-tertiary rounded w-full" />
      </div>
    </div>
  );
}

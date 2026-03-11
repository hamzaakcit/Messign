import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, Plus, Send } from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/authStore';
import { marketingAPI, type EmailCampaign } from '@/lib/marketingApi';
import { MarketingNav } from './components/MarketingNav';

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500';

export function MarketingEmailPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [emails, setEmails] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    subject: '',
    from_name: 'Messign',
    from_email: '',
    body_html: '',
    recipient_count: '0',
  });

  const fetchEmails = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const result = await marketingAPI.listEmailCampaigns(userId, { pageSize: '100' });
      setEmails(result.data);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const columns = useMemo<ColumnDef<EmailCampaign>[]>(() => [
    {
      key: 'name',
      header: 'Name',
      render: (_value, row) => <span className="font-medium text-app-text">{row.name}</span>,
    },
    { key: 'subject', header: 'Subject' },
    {
      key: 'status',
      header: 'Status',
      render: (value) => <Badge variant={String(value) === 'sent' ? 'green' : 'default'}>{String(value)}</Badge>,
    },
    { key: 'recipient_count', header: 'Recipients' },
    {
      key: 'open_rate',
      header: 'Open Rate',
      render: (value) => `${Number(value ?? 0).toFixed(1)}%`,
    },
    {
      key: 'click_rate',
      header: 'Click Rate',
      render: (value) => `${Number(value ?? 0).toFixed(1)}%`,
    },
    {
      key: 'sent_at',
      header: 'Sent',
      render: (value) => value ? new Date(String(value)).toLocaleDateString() : '—',
    },
  ], []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    await marketingAPI.createEmailCampaign(userId, {
      ...form,
      recipient_count: Number(form.recipient_count || 0),
    });
    setCreateOpen(false);
    setForm({
      name: '',
      subject: '',
      from_name: 'Messign',
      from_email: '',
      body_html: '',
      recipient_count: '0',
    });
    await fetchEmails();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <MarketingNav />
          <DoraInsightBar module="marketing" />

          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-app-text">Email Campaigns</h2>
              <p className="text-sm text-app-muted mt-1">Draft, schedule, and send nurture campaigns.</p>
            </div>
            <button onClick={() => setCreateOpen(true)} className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              New Email Campaign
            </button>
          </div>

          <DataTable
            data={emails}
            columns={columns}
            isLoading={loading}
            emptyMessage="No email campaigns yet."
            rowClassName={() => 'cursor-default'}
          />

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {emails.slice(0, 3).map((email) => (
              <div key={email.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant={email.status === 'sent' ? 'green' : 'default'}>{email.status}</Badge>
                  <button onClick={() => { void marketingAPI.sendEmailCampaign(userId, email.id).then(fetchEmails); }} className="px-2.5 py-1.5 rounded-lg text-xs bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
                    <Send className="w-3 h-3" />
                    Send
                  </button>
                </div>
                <p className="text-sm font-medium text-app-text">{email.name}</p>
                <p className="text-xs text-app-muted mt-1">{email.subject}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-app-muted">
                  <span>{email.recipient_count} recipients</span>
                  <span>{(email.open_rate ?? 0).toFixed(1)}% open</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SlideOverPanel isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Email Campaign" width={560}>
        <form onSubmit={handleCreate} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-app-muted mb-1">Name</label>
            <input className={inputClass} value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm text-app-muted mb-1">Subject</label>
            <input className={inputClass} value={form.subject} onChange={(e) => setForm((current) => ({ ...current, subject: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-app-muted mb-1">From Name</label>
              <input className={inputClass} value={form.from_name} onChange={(e) => setForm((current) => ({ ...current, from_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm text-app-muted mb-1">From Email</label>
              <input className={inputClass} value={form.from_email} onChange={(e) => setForm((current) => ({ ...current, from_email: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-app-muted mb-1">Recipients</label>
            <input className={inputClass} type="number" value={form.recipient_count} onChange={(e) => setForm((current) => ({ ...current, recipient_count: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm text-app-muted mb-1">Body</label>
            <textarea className={`${inputClass} min-h-40`} value={form.body_html} onChange={(e) => setForm((current) => ({ ...current, body_html: e.target.value }))} />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white flex items-center gap-1.5">
              <Mail className="w-4 h-4" />
              Create Campaign
            </button>
          </div>
        </form>
      </SlideOverPanel>
    </div>
  );
}

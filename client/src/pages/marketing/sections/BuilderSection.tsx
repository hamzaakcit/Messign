import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/authStore';
import { marketingAPI, type EmailCampaign } from '@/lib/marketingApi';
import { UnlayerEmailEditor, type UnlayerEmailEditorHandle } from '../components/UnlayerEmailEditor';
import { CampaignMetricsPanel } from '../components/CampaignMetricsPanel';
import { getStarterTemplates } from '../unlayerTemplates/registry';

type User = { id?: string; name?: string; email?: string } | null;

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500';

/** Email designs. Landing pages, popups and documents are not built from the marketing page (ADR-001, UX-D2). */
export function BuilderSection(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [items, setItems] = useState<EmailCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<EmailCampaign | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const emails = await marketingAPI.listEmailCampaigns(userId, { pageSize: '100' });
      setItems([...emails.data].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  /** Deep-link from an email card: `/marketing/builder?type=email&open=<id>` */
  const openId = searchParams.get('open');
  useEffect(() => {
    if (!openId || items.length === 0 || loading) return;
    const found = items.find((i) => i.id === openId);
    if (!found) return;
    setSelected(found);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('open');
        return next;
      },
      { replace: true },
    );
  }, [openId, items, loading, setSearchParams]);

  const columns = useMemo<ColumnDef<EmailCampaign>[]>(() => [
    { key: 'name', header: 'Name', sortable: true, render: (_v, row) => <span className="font-medium text-app-text">{row.name}</span> },
    { key: 'subject', header: 'Subject', render: (v) => <span className="text-app-muted">{v ? String(v) : '—'}</span> },
    { key: 'status', header: 'Status', render: (v) => <Badge variant={String(v) === 'sent' ? 'green' : 'default'}>{String(v)}</Badge> },
    { key: 'updated_at', header: 'Updated', render: (v) => new Date(String(v)).toLocaleDateString() },
  ], []);

  return (
    <>
      <DoraInsightBar module="marketing" />

      <div className="flex items-center justify-end mb-4">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          New email
        </button>
      </div>

      <DataTable
        data={items}
        columns={columns}
        isLoading={loading}
        emptyMessage="No email designs yet."
        rowClassName={() => 'cursor-pointer'}
        onRowClick={(row) => setSelected(row)}
      />

      <SlideOverPanel isOpen={!!selected} onClose={() => setSelected(null)} title="Edit email" width={1200}>
        {selected && (
          <EmailDetailPanel
            item={selected}
            userId={userId}
            user={user}
            onClose={() => setSelected(null)}
            onUpdated={() => { setSelected(null); void fetchAll(); }}
          />
        )}
      </SlideOverPanel>

      <SlideOverPanel isOpen={creating} onClose={() => setCreating(false)} title="New email" width={1200}>
        {creating && (
          <EmailCreatePanel
            userId={userId}
            user={user}
            onClose={() => setCreating(false)}
            onCreated={() => { setCreating(false); void fetchAll(); }}
          />
        )}
      </SlideOverPanel>
    </>
  );
}

function EmailDetailPanel({
  item,
  userId,
  user,
  onClose,
  onUpdated,
}: {
  item: EmailCampaign;
  userId: string;
  user: User;
  onClose: () => void;
  onUpdated: () => void;
}): JSX.Element {
  const editorRef = useRef<UnlayerEmailEditorHandle>(null);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState({
    name: item.name,
    subject: item.subject ?? '',
    from_name: item.from_name ?? '',
    from_email: item.from_email ?? '',
    recipient_count: String(item.recipient_count ?? 0),
  });
  const [bodyHtml, setBodyHtml] = useState(item.body_html ?? '');
  const [bodyDesign, setBodyDesign] = useState<Record<string, unknown> | null>(item.body_design ?? null);

  const handleSave = async () => {
    setSaving(true);
    try {
      let html = bodyHtml;
      let design = bodyDesign;
      try {
        const exported = await editorRef.current?.exportNow();
        if (exported) { html = exported.html; design = exported.design; }
      } catch { /* editor not ready */ }

      await marketingAPI.updateEmailCampaign(userId, item.id, {
        name: meta.name, subject: meta.subject, from_name: meta.from_name || null,
        from_email: meta.from_email || null, recipient_count: Number(meta.recipient_count || 0),
        body_html: html, body_design: design,
      });
      toast.success('Email saved.');
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} aria-label="Back" className="text-app-muted hover:text-app-text"><ArrowLeft className="w-4 h-4" /></button>
          <h2 className="text-lg font-semibold text-app-text">{meta.name}</h2>
        </div>
        <button type="button" disabled={saving} onClick={() => void handleSave()} className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-3 rounded-xl border border-app-border bg-app-surface-tertiary p-4">
          <h3 className="text-sm font-medium text-app-text">Details</h3>
          <div><label className="block text-xs text-app-muted mb-1">Name</label><input className={inputClass} value={meta.name} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))} /></div>
          <div><label className="block text-xs text-app-muted mb-1">Subject</label><input className={inputClass} value={meta.subject} onChange={(e) => setMeta((m) => ({ ...m, subject: e.target.value }))} /></div>
          <div><label className="block text-xs text-app-muted mb-1">From name</label><input className={inputClass} value={meta.from_name} onChange={(e) => setMeta((m) => ({ ...m, from_name: e.target.value }))} /></div>
          <div><label className="block text-xs text-app-muted mb-1">From email</label><input className={inputClass} value={meta.from_email} onChange={(e) => setMeta((m) => ({ ...m, from_email: e.target.value }))} /></div>
          <div><label className="block text-xs text-app-muted mb-1">Recipients</label><input className={inputClass} type="number" value={meta.recipient_count} onChange={(e) => setMeta((m) => ({ ...m, recipient_count: e.target.value }))} /></div>
          <CampaignMetricsPanel contentId={item.id} userId={userId} channel="email" subjectLine={meta.subject} />
        </div>

        <div className="lg:col-span-3 min-w-0">
          <UnlayerEmailEditor
            ref={editorRef}
            editorKey={item.id}
            initialDesign={bodyDesign}
            initialHtml={bodyHtml}
            user={user ? { id: user.id, name: user.name, email: user.email } : undefined}
            onApply={({ html, design }) => { setBodyHtml(html); setBodyDesign(design); }}
          />
        </div>
      </div>
    </div>
  );
}

function EmailCreatePanel({
  userId,
  user,
  onClose,
  onCreated,
}: {
  userId: string;
  user: User;
  onClose: () => void;
  onCreated: () => void;
}): JSX.Element {
  const [form, setForm] = useState({
    name: '',
    subject: '',
    from_name: 'Messign',
    from_email: '',
    body_html: '',
    body_design: null as Record<string, unknown> | null,
    recipient_count: '0',
  });

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.body_html?.trim()) {
      toast.error('Use "Apply HTML & design" in the builder before creating.');
      return;
    }
    await marketingAPI.createEmailCampaign(userId, {
      name: form.name, subject: form.subject, from_name: form.from_name, from_email: form.from_email,
      body_html: form.body_html, body_design: form.body_design, recipient_count: Number(form.recipient_count || 0),
    });
    toast.success('Email created.');
    onCreated();
  };

  return (
    <form onSubmit={handleCreate} className="p-6 space-y-4">
      <div><label className="block text-sm text-app-muted mb-1">Name</label><input className={inputClass} value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} required /></div>
      <div><label className="block text-sm text-app-muted mb-1">Subject</label><input className={inputClass} value={form.subject} onChange={(e) => setForm((c) => ({ ...c, subject: e.target.value }))} required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-sm text-app-muted mb-1">From Name</label><input className={inputClass} value={form.from_name} onChange={(e) => setForm((c) => ({ ...c, from_name: e.target.value }))} /></div>
        <div><label className="block text-sm text-app-muted mb-1">From Email</label><input className={inputClass} value={form.from_email} onChange={(e) => setForm((c) => ({ ...c, from_email: e.target.value }))} /></div>
      </div>
      <div><label className="block text-sm text-app-muted mb-1">Recipients</label><input className={inputClass} type="number" value={form.recipient_count} onChange={(e) => setForm((c) => ({ ...c, recipient_count: e.target.value }))} /></div>
      <UnlayerEmailEditor
        editorKey="create-email"
        initialDesign={null}
        starterTemplates={getStarterTemplates('email')}
        user={user ? { id: user.id, name: user.name, email: user.email } : undefined}
        onApply={({ html, design }) => setForm((c) => ({ ...c, body_html: html, body_design: design }))}
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-app-border text-app-text hover:bg-app-nav-hover">Cancel</button>
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text flex items-center gap-1.5">Create email</button>
      </div>
    </form>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppWindow, ArrowLeft, FileText, LayoutTemplate, Mail, Plus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import {
  marketingAPI,
  type EmailCampaign,
  type LandingPage,
  type MarketingDocument,
  type MarketingPopup,
} from '@/lib/marketingApi';
import { UnlayerEditor, type UnlayerEditorHandle } from '../components/UnlayerEditor';
import { UnlayerEmailEditor, type UnlayerEmailEditorHandle } from '../components/UnlayerEmailEditor';
import { CampaignMetricsPanel } from '../components/CampaignMetricsPanel';
import { getStarterTemplates } from '../unlayerTemplates/registry';

type BuilderType = 'all' | 'email' | 'landing_page' | 'popup' | 'document';

interface UnifiedItem {
  id: string;
  name: string;
  type: BuilderType;
  status: string;
  updated_at: string;
  slug?: string | null;
  subject?: string | null;
  body_html?: string | null;
  body_design?: Record<string, unknown> | null;
  recipient_count?: number;
  open_rate?: number | null;
  click_rate?: number | null;
  from_name?: string | null;
  from_email?: string | null;
}

const FILTER_CHIPS: { id: BuilderType; label: string; icon: React.ElementType }[] = [
  { id: 'all', label: 'All', icon: LayoutTemplate },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'landing_page', label: 'Landing Pages', icon: LayoutTemplate },
  { id: 'popup', label: 'Popups', icon: AppWindow },
  { id: 'document', label: 'Documents', icon: FileText },
];

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500';

function typeLabel(type: BuilderType): string {
  if (type === 'email') return 'Email';
  if (type === 'landing_page') return 'Landing Page';
  if (type === 'popup') return 'Popup';
  if (type === 'document') return 'Document';
  return 'Unknown';
}

function typeVariant(type: BuilderType): 'default' | 'blue' | 'purple' | 'green' | 'orange' {
  if (type === 'email') return 'blue';
  if (type === 'landing_page') return 'green';
  if (type === 'popup') return 'purple';
  if (type === 'document') return 'orange';
  return 'default';
}

export function BuilderSection(): JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const initialType = (searchParams.get('type') as BuilderType) || 'all';
  const [filterType, setFilterType] = useState<BuilderType>(initialType);
  const [items, setItems] = useState<UnifiedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<UnifiedItem | null>(null);
  const [createType, setCreateType] = useState<Exclude<BuilderType, 'all'> | null>(null);
  const [createDropdownOpen, setCreateDropdownOpen] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [emails, pages, popups, docs] = await Promise.all([
        marketingAPI.listEmailCampaigns(userId, { pageSize: '100' }),
        marketingAPI.listLandingPages(userId, { pageSize: '100' }),
        marketingAPI.listMarketingPopups(userId, { pageSize: '100' }),
        marketingAPI.listMarketingDocuments(userId, { pageSize: '100' }),
      ]);

      const unified: UnifiedItem[] = [
        ...emails.data.map((e: EmailCampaign) => ({
          id: e.id, name: e.name, type: 'email' as const, status: e.status,
          updated_at: e.updated_at, subject: e.subject, body_html: e.body_html,
          body_design: e.body_design, recipient_count: e.recipient_count,
          open_rate: e.open_rate, click_rate: e.click_rate,
          from_name: e.from_name, from_email: e.from_email,
        })),
        ...pages.data.map((p: LandingPage) => ({
          id: p.id, name: p.name ?? p.title, type: 'landing_page' as const, status: p.status,
          updated_at: p.updated_at, slug: p.slug, body_html: p.body_html, body_design: p.body_design,
        })),
        ...popups.data.map((p: MarketingPopup) => ({
          id: p.id, name: p.name, type: 'popup' as const, status: p.status,
          updated_at: p.updated_at, slug: p.slug, body_html: p.body_html, body_design: p.body_design,
        })),
        ...docs.data.map((d: MarketingDocument) => ({
          id: d.id, name: d.name ?? d.title, type: 'document' as const, status: d.status,
          updated_at: d.updated_at, slug: d.slug, body_html: d.body_html, body_design: d.body_design,
        })),
      ].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

      setItems(unified);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /** Deep-link from board email card: `/marketing/builder?type=email&open=<id>` */
  const openId = searchParams.get('open');
  useEffect(() => {
    if (!openId || items.length === 0 || loading) return;
    const found = items.find((i) => i.id === openId);
    if (found) {
      setSelectedItem(found);
      if (found.type !== 'all') setFilterType(found.type);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('open');
          return next;
        },
        { replace: true },
      );
    }
  }, [openId, items, loading, setSearchParams]);

  const filtered = useMemo(() => {
    if (filterType === 'all') return items;
    return items.filter((i) => i.type === filterType);
  }, [items, filterType]);

  const columns = useMemo<ColumnDef<UnifiedItem>[]>(() => [
    { key: 'name', header: 'Name', sortable: true, render: (_v, row) => <span className="font-medium text-app-text">{row.name}</span> },
    { key: 'type', header: 'Type', render: (_v, row) => <Badge variant={typeVariant(row.type)}>{typeLabel(row.type)}</Badge> },
    { key: 'status', header: 'Status', render: (v) => <Badge variant={String(v) === 'sent' || String(v) === 'published' ? 'green' : 'default'}>{String(v)}</Badge> },
    { key: 'updated_at', header: 'Updated', render: (v) => new Date(String(v)).toLocaleDateString() },
  ], []);

  const handleFilterChange = (type: BuilderType) => {
    setFilterType(type);
    if (type === 'all') {
      setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('type'); return next; });
    } else {
      setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('type', type); return next; });
    }
  };

  return (
    <>
      <DoraInsightBar module="marketing" />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          {FILTER_CHIPS.map((chip) => {
            const Icon = chip.icon;
            const isActive = filterType === chip.id;
            return (
              <button
                key={chip.id}
                onClick={() => handleFilterChange(chip.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-primary-500/20 text-primary-400' : 'text-app-muted hover:text-app-text hover:bg-app-nav-hover',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {chip.label}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <button
            onClick={() => setCreateDropdownOpen((o) => !o)}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            New
          </button>
          {createDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setCreateDropdownOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border border-app-border bg-app-card shadow-xl py-1">
                {FILTER_CHIPS.filter((c) => c.id !== 'all').map((c) => {
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setCreateType(c.id as Exclude<BuilderType, 'all'>);
                        setCreateDropdownOpen(false);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-app-text hover:bg-app-nav-hover"
                    >
                      <Icon className="w-4 h-4 text-app-muted" />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        isLoading={loading}
        emptyMessage="No builder items yet."
        rowClassName={() => 'cursor-pointer'}
        onRowClick={(row) => setSelectedItem(row)}
      />

      <SlideOverPanel
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        title={selectedItem ? `Edit ${typeLabel(selectedItem.type)}` : 'Detail'}
        width={1200}
      >
        {selectedItem && (
          <BuilderDetailPanel
            item={selectedItem}
            userId={userId}
            user={user}
            onClose={() => setSelectedItem(null)}
            onUpdated={() => { setSelectedItem(null); void fetchAll(); }}
          />
        )}
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={!!createType}
        onClose={() => setCreateType(null)}
        title={createType ? `New ${typeLabel(createType)}` : 'New'}
        width={1200}
      >
        {createType && (
          <BuilderCreatePanel
            type={createType}
            userId={userId}
            user={user}
            onClose={() => setCreateType(null)}
            onCreated={() => { setCreateType(null); void fetchAll(); }}
          />
        )}
      </SlideOverPanel>
    </>
  );
}

function BuilderDetailPanel({
  item,
  userId,
  user,
  onClose,
  onUpdated,
}: {
  item: UnifiedItem;
  userId: string;
  user: { id?: string; name?: string; email?: string } | null;
  onClose: () => void;
  onUpdated: () => void;
}): JSX.Element {
  const editorRef = useRef<UnlayerEditorHandle | UnlayerEmailEditorHandle>(null);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState({
    name: item.name,
    subject: item.subject ?? '',
    slug: item.slug ?? '',
    status: item.status,
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
        const exported = await (editorRef.current as UnlayerEditorHandle)?.exportNow();
        if (exported) { html = exported.html; design = exported.design; }
      } catch { /* editor not ready */ }

      if (item.type === 'email') {
        await marketingAPI.updateEmailCampaign(userId, item.id, {
          name: meta.name, subject: meta.subject, from_name: meta.from_name || null,
          from_email: meta.from_email || null, recipient_count: Number(meta.recipient_count || 0),
          body_html: html, body_design: design,
        });
      } else if (item.type === 'landing_page') {
        await marketingAPI.updateLandingPage(userId, item.id, {
          name: meta.name, slug: meta.slug.trim() || undefined, status: meta.status, body_html: html, body_design: design,
        });
      } else if (item.type === 'popup') {
        await marketingAPI.updateMarketingPopup(userId, item.id, {
          name: meta.name, slug: meta.slug.trim() || undefined, status: meta.status, body_html: html, body_design: design,
        });
      } else {
        await marketingAPI.updateMarketingDocument(userId, item.id, {
          name: meta.name, slug: meta.slug.trim() || null, status: meta.status, body_html: html, body_design: design,
        });
      }
      toast.success(`${typeLabel(item.type)} saved.`);
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async () => {
    if (item.type !== 'email') return;
    await marketingAPI.sendEmailCampaign(userId, item.id);
    toast.success('Email campaign sent.');
    onUpdated();
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="text-app-muted hover:text-app-text"><ArrowLeft className="w-4 h-4" /></button>
          <h2 className="text-lg font-semibold text-app-text">{meta.name}</h2>
          <Badge variant={typeVariant(item.type)}>{typeLabel(item.type)}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {item.type === 'email' && (
            <button type="button" onClick={() => void handleSend()} className="px-3 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 flex items-center gap-1.5">
              <Send className="w-4 h-4" />Send
            </button>
          )}
          <button type="button" disabled={saving} onClick={() => void handleSave()} className="px-3 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-50">
            {saving ? 'Saving\u2026' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-3 rounded-xl border border-app-border bg-app-surface-tertiary p-4">
          <h3 className="text-sm font-medium text-app-text">Details</h3>
          <div><label className="block text-xs text-app-muted mb-1">Name</label><input className={inputClass} value={meta.name} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))} /></div>
          {item.type === 'email' && (
            <>
              <div><label className="block text-xs text-app-muted mb-1">Subject</label><input className={inputClass} value={meta.subject} onChange={(e) => setMeta((m) => ({ ...m, subject: e.target.value }))} /></div>
              <div><label className="block text-xs text-app-muted mb-1">From name</label><input className={inputClass} value={meta.from_name} onChange={(e) => setMeta((m) => ({ ...m, from_name: e.target.value }))} /></div>
              <div><label className="block text-xs text-app-muted mb-1">From email</label><input className={inputClass} value={meta.from_email} onChange={(e) => setMeta((m) => ({ ...m, from_email: e.target.value }))} /></div>
              <div><label className="block text-xs text-app-muted mb-1">Recipients</label><input className={inputClass} type="number" value={meta.recipient_count} onChange={(e) => setMeta((m) => ({ ...m, recipient_count: e.target.value }))} /></div>
              <CampaignMetricsPanel contentId={item.id} userId={userId} channel="email" subjectLine={meta.subject} />
            </>
          )}
          {item.type !== 'email' && (
            <>
              <div><label className="block text-xs text-app-muted mb-1">Slug</label><input className={inputClass} value={meta.slug} onChange={(e) => setMeta((m) => ({ ...m, slug: e.target.value }))} placeholder="optional" /></div>
              <div><label className="block text-xs text-app-muted mb-1">Status</label><select className={inputClass} value={meta.status} onChange={(e) => setMeta((m) => ({ ...m, status: e.target.value }))}><option value="draft">Draft</option><option value="published">Published</option></select></div>
            </>
          )}
        </div>

        <div className="lg:col-span-3 min-w-0">
          <h3 className="text-sm font-medium text-app-text mb-3">{typeLabel(item.type)} builder</h3>
          {item.type === 'email' ? (
            <UnlayerEmailEditor
              ref={editorRef as React.Ref<UnlayerEmailEditorHandle>}
              editorKey={item.id}
              initialDesign={bodyDesign}
              initialHtml={bodyHtml}
              user={user ? { id: user.id, name: user.name, email: user.email } : undefined}
              onApply={({ html, design }) => { setBodyHtml(html); setBodyDesign(design); }}
            />
          ) : (
            <UnlayerEditor
              ref={editorRef as React.Ref<UnlayerEditorHandle>}
              displayMode={item.type === 'landing_page' ? 'web' : item.type === 'popup' ? 'popup' : 'document'}
              exportPopupId={item.type === 'popup' ? item.id : undefined}
              editorKey={item.id}
              initialDesign={bodyDesign}
              initialHtml={bodyHtml}
              user={user ? { id: user.id, name: user.name, email: user.email } : undefined}
              onApply={({ html, design }) => { setBodyHtml(html); setBodyDesign(design); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BuilderCreatePanel({
  type,
  userId,
  user,
  onClose,
  onCreated,
}: {
  type: Exclude<BuilderType, 'all'>;
  userId: string;
  user: { id?: string; name?: string; email?: string } | null;
  onClose: () => void;
  onCreated: () => void;
}): JSX.Element {
  const [form, setForm] = useState({
    name: '',
    subject: '',
    slug: '',
    from_name: 'Messign',
    from_email: '',
    body_html: '',
    body_design: null as Record<string, unknown> | null,
    status: 'draft',
    recipient_count: '0',
  });

  const displayMode = type === 'email' ? 'email' : type === 'landing_page' ? 'web' : type === 'popup' ? 'popup' : 'document';
  const [createExportPopupId] = useState(() => type === 'popup' ? crypto.randomUUID() : undefined);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.body_html?.trim()) {
      toast.error('Use "Apply HTML & design" in the builder before creating.');
      return;
    }

    if (type === 'email') {
      await marketingAPI.createEmailCampaign(userId, {
        name: form.name, subject: form.subject, from_name: form.from_name, from_email: form.from_email,
        body_html: form.body_html, body_design: form.body_design, recipient_count: Number(form.recipient_count || 0),
      });
    } else if (type === 'landing_page') {
      await marketingAPI.createLandingPage(userId, {
        name: form.name, slug: form.slug.trim() || undefined, body_html: form.body_html, body_design: form.body_design, status: form.status,
      });
    } else if (type === 'popup') {
      await marketingAPI.createMarketingPopup(userId, {
        name: form.name, slug: form.slug.trim() || undefined, body_html: form.body_html, body_design: form.body_design, status: form.status,
      });
    } else {
      await marketingAPI.createMarketingDocument(userId, {
        name: form.name, slug: form.slug.trim() || undefined, body_html: form.body_html, body_design: form.body_design, status: form.status,
      });
    }

    toast.success(`${typeLabel(type)} created.`);
    onCreated();
  };

  return (
    <form onSubmit={handleCreate} className="p-6 space-y-4">
      <div><label className="block text-sm text-app-muted mb-1">Name</label><input className={inputClass} value={form.name} onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))} required /></div>
      {type === 'email' && (
        <>
          <div><label className="block text-sm text-app-muted mb-1">Subject</label><input className={inputClass} value={form.subject} onChange={(e) => setForm((c) => ({ ...c, subject: e.target.value }))} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm text-app-muted mb-1">From Name</label><input className={inputClass} value={form.from_name} onChange={(e) => setForm((c) => ({ ...c, from_name: e.target.value }))} /></div>
            <div><label className="block text-sm text-app-muted mb-1">From Email</label><input className={inputClass} value={form.from_email} onChange={(e) => setForm((c) => ({ ...c, from_email: e.target.value }))} /></div>
          </div>
          <div><label className="block text-sm text-app-muted mb-1">Recipients</label><input className={inputClass} type="number" value={form.recipient_count} onChange={(e) => setForm((c) => ({ ...c, recipient_count: e.target.value }))} /></div>
        </>
      )}
      {type !== 'email' && (
        <>
          <div><label className="block text-sm text-app-muted mb-1">Slug (optional)</label><input className={inputClass} value={form.slug} onChange={(e) => setForm((c) => ({ ...c, slug: e.target.value }))} /></div>
          <div><label className="block text-sm text-app-muted mb-1">Status</label><select className={inputClass} value={form.status} onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))}><option value="draft">Draft</option><option value="published">Published</option></select></div>
        </>
      )}
      <div>
        <label className="block text-sm text-app-muted mb-2">{typeLabel(type)} builder</label>
        {type === 'email' ? (
          <UnlayerEmailEditor
            editorKey={`create-${type}`}
            initialDesign={null}
            starterTemplates={getStarterTemplates('email')}
            user={user ? { id: user.id, name: user.name, email: user.email } : undefined}
            onApply={({ html, design }) => setForm((c) => ({ ...c, body_html: html, body_design: design }))}
          />
        ) : (
          <UnlayerEditor
            editorKey={`create-${type}`}
            displayMode={displayMode}
            exportPopupId={createExportPopupId}
            initialDesign={null}
            starterTemplates={getStarterTemplates(displayMode)}
            user={user ? { id: user.id, name: user.name, email: user.email } : undefined}
            onApply={({ html, design }) => setForm((c) => ({ ...c, body_html: html, body_design: design }))}
          />
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium border border-app-border text-app-text hover:bg-app-nav-hover">Cancel</button>
        <button type="submit" className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text flex items-center gap-1.5">Create {typeLabel(type)}</button>
      </div>
    </form>
  );
}

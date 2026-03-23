import { useEffect, useState, useCallback } from 'react';
import { Loader2, Radar } from 'lucide-react';
import { toast } from 'sonner';
import { marketingAPI, type CompetitorClient } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500';

const TIERS = [
  { value: 'direct', label: 'Direct', color: 'bg-blue-500/15 text-blue-400' },
  { value: 'indirect', label: 'Indirect', color: 'bg-gray-500/15 text-gray-400' },
  { value: 'aspirational', label: 'Aspirational', color: 'bg-purple-500/15 text-purple-400' },
] as const;

function tierBadge(tier: string) {
  const cfg = TIERS.find((t) => t.value === tier) || TIERS[1];
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>;
}

function formatFreshness(lastScraped: string | null): string {
  if (!lastScraped) return 'Never scraped';
  const diff = Date.now() - new Date(lastScraped).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

function TagInput({ tags, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState('');
  const addTag = () => {
    const trimmed = input.trim();
    if (!trimmed || tags.includes(trimmed)) { setInput(''); return; }
    onChange([...tags, trimmed]);
    setInput('');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-400 text-xs">
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((t) => t !== tag))} className="hover:text-red-400">×</button>
          </span>
        ))}
      </div>
      <input
        className={inputClass}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
        placeholder={placeholder || 'Type and press Enter'}
      />
    </div>
  );
}

type FormData = {
  name: string;
  website_url: string;
  description: string;
  industry: string;
  tier: 'direct' | 'indirect' | 'aspirational';
  monitor_urls: string[];
  monitor_email: boolean;
  monitor_social: boolean;
};

const emptyForm: FormData = {
  name: '',
  website_url: '',
  description: '',
  industry: '',
  tier: 'direct',
  monitor_urls: [],
  monitor_email: false,
  monitor_social: false,
};

function competitorToForm(c: CompetitorClient): FormData {
  return {
    name: c.name,
    website_url: c.website_url || '',
    description: c.description || '',
    industry: c.industry || '',
    tier: c.tier,
    monitor_urls: c.monitor_urls,
    monitor_email: c.monitor_email,
    monitor_social: c.monitor_social,
  };
}

interface CompetitorManagerProps {
  onViewEvents?: (competitorId: string) => void;
}

export function CompetitorManager({ onViewEvents }: CompetitorManagerProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [competitors, setCompetitors] = useState<CompetitorClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [scraping, setScraping] = useState<string | null>(null);

  const fetchCompetitors = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await marketingAPI.listCompetitors(userId, { include_inactive: true });
      setCompetitors(res.competitors);
    } catch { /* non-critical */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchCompetitors(); }, [fetchCompetitors]);

  const cancel = () => { setCreating(false); setEditingId(null); setForm(emptyForm); };

  const handleSave = async () => {
    if (!userId || !form.name.trim()) return;
    setSaving(true);
    try {
      if (creating) {
        await marketingAPI.createCompetitor(userId, form);
        toast.success('Competitor created');
      } else if (editingId) {
        await marketingAPI.updateCompetitor(userId, editingId, form);
        toast.success('Competitor updated');
      }
      cancel();
      await fetchCompetitors();
    } catch { toast.error('Failed to save competitor'); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!userId) return;
    setSaving(true);
    try {
      await marketingAPI.deleteCompetitor(userId, id);
      setConfirmDelete(null);
      cancel();
      await fetchCompetitors();
      toast.success('Competitor removed');
    } catch { toast.error('Failed to delete'); }
    setSaving(false);
  };

  const handleScrape = async (id: string) => {
    if (!userId) return;
    setScraping(id);
    try {
      await marketingAPI.triggerCompetitorScrape(userId, id);
      toast.success('Scrape queued');
    } catch { toast.error('Scrape failed'); }
    setScraping(null);
  };

  const handleScrapeAll = async () => {
    if (!userId) return;
    setScraping('all');
    try {
      const res = await marketingAPI.triggerScrapeAll(userId);
      toast.success(res.message);
    } catch { toast.error('Bulk scrape failed'); }
    setScraping(null);
  };

  const isEditing = creating || editingId !== null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="p-6 space-y-4">
        <h3 className="text-base font-medium text-app-text">{creating ? 'Add Competitor' : 'Edit Competitor'}</h3>
        <div>
          <label className="block text-sm text-app-muted mb-1">Name *</label>
          <input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm text-app-muted mb-1">Website URL</label>
          <input className={inputClass} value={form.website_url} onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))} placeholder="https://competitor.com" />
        </div>
        <div>
          <label className="block text-sm text-app-muted mb-1">Description</label>
          <textarea className={`${inputClass} min-h-20`} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-app-muted mb-1">Industry</label>
            <input className={inputClass} value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} placeholder="SaaS, FinTech, etc." />
          </div>
          <div>
            <label className="block text-sm text-app-muted mb-1">Tier</label>
            <select className={inputClass} value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value as FormData['tier'] }))}>
              {TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm text-app-muted mb-1">Monitor URLs</label>
          <TagInput tags={form.monitor_urls} onChange={(t) => setForm((f) => ({ ...f, monitor_urls: t }))} placeholder="https://competitor.com/blog" />
        </div>
        <div className="flex gap-6">
          <label className="inline-flex items-center gap-2 text-sm text-app-text">
            <input type="checkbox" checked={form.monitor_email} onChange={(e) => setForm((f) => ({ ...f, monitor_email: e.target.checked }))} className="rounded border-app-border" />
            Monitor Email
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-app-text">
            <input type="checkbox" checked={form.monitor_social} onChange={(e) => setForm((f) => ({ ...f, monitor_social: e.target.checked }))} className="rounded border-app-border" />
            Monitor Social
          </label>
        </div>

        <div className="flex items-center justify-between pt-3">
          <div>
            {editingId && (
              confirmDelete === editingId ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleDelete(editingId)} disabled={saving} className="px-3 py-1.5 rounded text-xs bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">Confirm Delete</button>
                  <button type="button" onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 rounded text-xs text-app-muted hover:text-app-text">Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(editingId)} className="px-3 py-1.5 rounded text-xs text-red-400 hover:text-red-300">Delete</button>
              )
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={cancel} className="px-3 py-2 rounded-lg text-sm text-app-muted hover:text-app-text">Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving || !form.name.trim()} className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50">
              {saving ? 'Saving…' : creating ? 'Create' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-medium text-app-text">Competitors</h3>
        <div className="flex gap-2">
          {competitors.length > 0 && (
            <button type="button" onClick={handleScrapeAll} disabled={scraping === 'all'} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-app-hover text-app-text hover:bg-app-card disabled:opacity-50">
              {scraping === 'all' ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : <Radar className="w-3 h-3 inline mr-1" />}
              Scrape All
            </button>
          )}
          <button type="button" onClick={() => { setCreating(true); setEditingId(null); setForm(emptyForm); }} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-500 text-white hover:bg-primary-600">
            + Add Competitor
          </button>
        </div>
      </div>

      {competitors.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-app-muted mb-3">No competitors tracked yet. Add one to start monitoring.</p>
          <button type="button" onClick={() => { setCreating(true); setForm(emptyForm); }} className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-white hover:bg-primary-600">
            Add First Competitor
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {competitors.map((c) => (
            <div key={c.id} className="p-4 rounded-lg border border-app-border bg-app-card/50 hover:bg-app-card transition-colors">
              <div className="flex items-center justify-between mb-1">
                <button type="button" onClick={() => { setCreating(false); setEditingId(c.id); setForm(competitorToForm(c)); }} className="text-sm font-medium text-app-text hover:text-primary-400 text-left">
                  {c.name}
                </button>
                <div className="flex items-center gap-2">
                  {tierBadge(c.tier)}
                  {!c.active && <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-500/15 text-red-400">Inactive</span>}
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-app-muted mb-2">
                {c.website_url && <span>{new URL(c.website_url).hostname}</span>}
                {c.industry && <span>{c.industry}</span>}
                <span>{c.monitor_urls.length} URLs</span>
                <span>{formatFreshness(c.last_scraped_at)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => handleScrape(c.id)} disabled={scraping === c.id} className="px-2 py-1 rounded text-[11px] bg-app-hover text-app-muted hover:text-app-text disabled:opacity-50">
                  {scraping === c.id ? 'Scraping…' : 'Scrape Now'}
                </button>
                {onViewEvents && (
                  <button type="button" onClick={() => onViewEvents(c.id)} className="px-2 py-1 rounded text-[11px] text-primary-400 hover:text-primary-300">
                    View Events
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

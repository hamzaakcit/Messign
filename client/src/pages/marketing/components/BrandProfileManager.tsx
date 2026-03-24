import { useEffect, useState, useCallback } from 'react';
import { marketingAPI, type BrandProfileClient, type BrandProfileStats } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';

const inputClass =
  'w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text focus:outline-none focus:ring-1 focus:ring-primary-500';

const VALID_THEMES = ['executive', 'startup', 'luxury', 'minimal', 'bold', 'nature', 'tech', 'warm'] as const;

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

function TagInput({ tags, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const trimmed = input.trim();
    if (!trimmed || tags.includes(trimmed)) {
      setInput('');
      return;
    }
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
  brand_name: string;
  brand_description: string;
  logo_url: string;
  tone_keywords: string[];
  forbidden_words: string[];
  required_disclaimers: string[];
  voice_examples: string[];
  style_guide_notes: string;
  color_palette: Record<string, string>;
  preferred_themes: string[];
};

const emptyForm: FormData = {
  brand_name: '',
  brand_description: '',
  logo_url: '',
  tone_keywords: [],
  forbidden_words: [],
  required_disclaimers: [],
  voice_examples: [],
  style_guide_notes: '',
  color_palette: {},
  preferred_themes: [],
};

function profileToForm(p: BrandProfileClient): FormData {
  return {
    brand_name: p.brand_name,
    brand_description: p.brand_description || '',
    logo_url: p.logo_url || '',
    tone_keywords: p.tone_keywords,
    forbidden_words: p.forbidden_words,
    required_disclaimers: p.required_disclaimers,
    voice_examples: p.voice_examples,
    style_guide_notes: p.style_guide_notes || '',
    color_palette: p.color_palette,
    preferred_themes: p.preferred_themes,
  };
}

interface ColorPaletteEditorProps {
  palette: Record<string, string>;
  onChange: (palette: Record<string, string>) => void;
}

function ColorPaletteEditor({ palette, onChange }: ColorPaletteEditorProps) {
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('#');
  const entries = Object.entries(palette);

  const addColor = () => {
    const k = newKey.trim();
    const v = newVal.trim();
    if (!k || !v.match(/^#[0-9a-fA-F]{3,8}$/)) return;
    onChange({ ...palette, [k]: v });
    setNewKey('');
    setNewVal('#');
  };

  return (
    <div className="space-y-1.5">
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-2">
          <div className="w-5 h-5 rounded border border-app-border" style={{ backgroundColor: val }} />
          <span className="text-xs text-app-muted flex-1">{key}: {val}</span>
          <button type="button" onClick={() => { const next = { ...palette }; delete next[key]; onChange(next); }} className="text-xs text-red-400 hover:text-red-300">×</button>
        </div>
      ))}
      <div className="flex gap-2">
        <input className={`${inputClass} w-24`} value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="Name" />
        <input className={`${inputClass} w-24`} value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="#hex" />
        <button type="button" onClick={addColor} className="px-2 py-1 rounded text-xs bg-primary-500/20 text-primary-400 hover:bg-primary-500/30">Add</button>
      </div>
    </div>
  );
}

export function BrandProfileManager() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [profiles, setProfiles] = useState<BrandProfileClient[]>([]);
  const [stats, setStats] = useState<BrandProfileStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        marketingAPI.listBrandProfiles(userId, { limit: 200 }),
        marketingAPI.getBrandProfileStats(userId),
      ]);
      setProfiles(listRes.profiles);
      setStats(statsRes.stats);
    } catch { /* non-critical */ }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const getContentCount = (id: string) => stats.find((s) => s.brand_profile_id === id)?.content_count ?? 0;

  const openCreate = () => {
    setCreating(true);
    setEditingId(null);
    setForm(emptyForm);
  };

  const openEdit = (p: BrandProfileClient) => {
    setCreating(false);
    setEditingId(p.id);
    setForm(profileToForm(p));
  };

  const cancel = () => {
    setCreating(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!userId || !form.brand_name.trim()) return;
    setSaving(true);
    try {
      if (creating) {
        await marketingAPI.createBrandProfile(userId, form);
      } else if (editingId) {
        await marketingAPI.updateBrandProfile(userId, editingId, form);
      }
      cancel();
      await fetchProfiles();
    } catch { /* handled by API layer */ }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!userId) return;
    setSaving(true);
    try {
      await marketingAPI.deleteBrandProfile(userId, id);
      setConfirmDelete(null);
      cancel();
      await fetchProfiles();
    } catch { /* handled by API layer */ }
    setSaving(false);
  };

  const isEditing = creating || editingId !== null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-400/40 border-t-primary-400" />
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="p-6 space-y-4">
        <h3 className="text-base font-medium text-app-text">{creating ? 'Create Brand Profile' : 'Edit Brand Profile'}</h3>
        <div>
          <label className="block text-sm text-app-muted mb-1">Brand Name *</label>
          <input className={inputClass} value={form.brand_name} onChange={(e) => setForm((f) => ({ ...f, brand_name: e.target.value }))} required />
        </div>
        <div>
          <label className="block text-sm text-app-muted mb-1">Description</label>
          <textarea className={`${inputClass} min-h-20`} value={form.brand_description} onChange={(e) => setForm((f) => ({ ...f, brand_description: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm text-app-muted mb-1">Logo URL</label>
          <input className={inputClass} value={form.logo_url} onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm text-app-muted mb-1">Tone Keywords</label>
          <TagInput tags={form.tone_keywords} onChange={(t) => setForm((f) => ({ ...f, tone_keywords: t }))} placeholder="e.g. professional, friendly" />
        </div>
        <div>
          <label className="block text-sm text-app-muted mb-1">Forbidden Words</label>
          <TagInput tags={form.forbidden_words} onChange={(t) => setForm((f) => ({ ...f, forbidden_words: t }))} placeholder="e.g. cheap, discount" />
        </div>
        <div>
          <label className="block text-sm text-app-muted mb-1">Required Disclaimers</label>
          <TagInput tags={form.required_disclaimers} onChange={(t) => setForm((f) => ({ ...f, required_disclaimers: t }))} placeholder="e.g. Results may vary" />
        </div>
        <div>
          <label className="block text-sm text-app-muted mb-1">Voice Examples</label>
          <TagInput tags={form.voice_examples} onChange={(t) => setForm((f) => ({ ...f, voice_examples: t }))} placeholder="Example sentence fragments" />
        </div>
        <div>
          <label className="block text-sm text-app-muted mb-1">Style Guide Notes</label>
          <textarea className={`${inputClass} min-h-20`} value={form.style_guide_notes} onChange={(e) => setForm((f) => ({ ...f, style_guide_notes: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm text-app-muted mb-1">Color Palette</label>
          <ColorPaletteEditor palette={form.color_palette} onChange={(p) => setForm((f) => ({ ...f, color_palette: p }))} />
        </div>
        <div>
          <label className="block text-sm text-app-muted mb-1">Preferred Themes</label>
          <div className="flex flex-wrap gap-2">
            {VALID_THEMES.map((theme) => (
              <label key={theme} className="inline-flex items-center gap-1.5 text-xs text-app-text">
                <input
                  type="checkbox"
                  checked={form.preferred_themes.includes(theme)}
                  onChange={() => {
                    setForm((f) => ({
                      ...f,
                      preferred_themes: f.preferred_themes.includes(theme)
                        ? f.preferred_themes.filter((t) => t !== theme)
                        : [...f.preferred_themes, theme],
                    }));
                  }}
                  className="rounded border-app-border"
                />
                {theme}
              </label>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between pt-3">
          <div>
            {editingId && (
              confirmDelete === editingId ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => handleDelete(editingId)} disabled={saving} className="px-3 py-1.5 rounded text-xs bg-red-600 text-app-text hover:bg-red-700 disabled:opacity-50">Confirm Delete</button>
                  <button type="button" onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 rounded text-xs text-app-muted hover:text-app-text">Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(editingId)} className="px-3 py-1.5 rounded text-xs text-red-400 hover:text-red-300">Delete</button>
              )
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={cancel} className="px-3 py-2 rounded-lg text-sm text-app-muted hover:text-app-text">Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving || !form.brand_name.trim()} className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-50">
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
        <h3 className="text-base font-medium text-app-text">Brand Profiles</h3>
        <button type="button" onClick={openCreate} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary-500 text-app-text hover:bg-primary-600">
          + Create Brand
        </button>
      </div>

      {profiles.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-app-muted mb-3">No brand profiles yet. Create one to start managing brand voice consistency.</p>
          <button type="button" onClick={openCreate} className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-500 text-app-text hover:bg-primary-600">
            Create First Brand
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openEdit(p)}
              className="w-full text-left p-4 rounded-lg border border-app-border bg-app-card/50 hover:bg-app-card transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-app-text">{p.brand_name}</span>
                <span className="text-xs text-app-muted">{getContentCount(p.id)} content</span>
              </div>
              {p.brand_description && (
                <p className="text-xs text-app-muted line-clamp-1 mb-1.5">{p.brand_description}</p>
              )}
              {p.tone_keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.tone_keywords.slice(0, 5).map((kw) => (
                    <span key={kw} className="px-1.5 py-0.5 rounded-full bg-primary-500/10 text-primary-400 text-[10px]">{kw}</span>
                  ))}
                  {p.tone_keywords.length > 5 && (
                    <span className="text-[10px] text-app-muted">+{p.tone_keywords.length - 5}</span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

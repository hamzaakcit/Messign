import { useState } from 'react';
import { toast } from 'sonner';
import { marketingAPI } from '@/lib/marketingApi';

const CHANNEL_OPTIONS = [
  { id: 'linkedin', label: 'LinkedIn', icon: '💼', desc: 'Professional post' },
  { id: 'x', label: 'X / Twitter', icon: '𝕏', desc: 'Short post or thread' },
  { id: 'instagram', label: 'Instagram', icon: '📸', desc: 'Caption + image brief' },
  { id: 'email', label: 'Email', icon: '✉️', desc: 'Newsletter snippet' },
  { id: 'blog', label: 'Blog', icon: '📝', desc: 'Long-form outline' },
  { id: 'ad', label: 'Ad copy', icon: '📢', desc: 'Headline variants' },
] as const;

export function RepurposeModal({
  userId,
  sourceContentId,
  sourceChannel,
  onComplete,
  onClose,
}: {
  userId: string;
  sourceContentId: string;
  sourceChannel: string | null | undefined;
  onComplete: (variants: Array<{ content_id: string; channel: string; status: string; title: string }>) => void;
  onClose: () => void;
}) {
  const src = (sourceChannel ?? '').toLowerCase().trim();
  const normSrc = src === 'twitter' ? 'x' : src;
  const available = CHANNEL_OPTIONS.filter((ch) => ch.id !== normSrc);

  const [selected, setSelected] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<Array<{ content_id: string; channel: string; status: string; title: string }> | null>(
    null,
  );

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const handleRepurpose = async () => {
    if (selected.length === 0) return;
    setProcessing(true);
    try {
      const data = await marketingAPI.repurposeContent(userId, sourceContentId, {
        target_channels: selected,
      });
      if (data.variants?.length) {
        setResults(data.variants);
        onComplete(data.variants);
      }
      if (data.errors?.length) {
        toast.message('Some channels failed', { description: data.errors.slice(0, 3).join('; ') });
      }
      if (!data.success && (!data.variants || data.variants.length === 0)) {
        toast.error('Repurpose failed', { description: data.errors?.join('; ') ?? 'Unknown error' });
      }
    } catch (e) {
      toast.error('Repurpose failed', { description: e instanceof Error ? e.message : 'Unknown' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="border-t border-white/[0.06]">
      <div className="p-3">
        <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Repurpose to other channels
        </h4>

        {!results ? (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {available.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => toggle(ch.id)}
                  className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                    selected.includes(ch.id)
                      ? 'border-purple-500/40 bg-purple-500/10 text-purple-200'
                      : 'border-white/[0.08] bg-app-surface-tertiary text-slate-400 hover:bg-app-hover'
                  }`}
                >
                  <span className="text-sm">{ch.icon}</span>
                  <span className="ml-1.5 font-medium">{ch.label}</span>
                  <p className="mt-0.5 text-[10px] opacity-60">{ch.desc}</p>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void handleRepurpose()}
              disabled={selected.length === 0 || processing}
              className="w-full rounded-lg border border-purple-500/30 bg-purple-600/20 py-2 text-xs font-medium text-purple-200 transition-colors hover:bg-purple-600/30 disabled:opacity-40"
            >
              {processing
                ? `Generating ${selected.length} variant${selected.length > 1 ? 's' : ''}…`
                : `Repurpose to ${selected.length} channel${selected.length === 1 ? '' : 's'}`}
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <p className="mb-2 text-xs text-slate-500">
              {results.length} variant{results.length === 1 ? '' : 's'} created
            </p>
            {results.map((v) => (
              <div
                key={v.content_id}
                className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-app-surface-tertiary p-2"
              >
                <span className="text-xs font-medium text-slate-300">{v.channel}</span>
                <span className="truncate text-[10px] text-slate-500">{v.title}</span>
                <span
                  className={`ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                    v.status === 'in_review' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-500/10 text-slate-400'
                  }`}
                >
                  {v.status}
                </span>
              </div>
            ))}
            <button
              type="button"
              onClick={onClose}
              className="w-full py-1.5 text-xs text-slate-500 hover:text-slate-300"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

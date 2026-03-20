import { useCallback, useEffect, useState } from 'react';
import { Calendar, Globe, Send } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { marketingAPI, type ContentItem } from '@/lib/marketingApi';
import { useAuthStore } from '@/stores/authStore';
import { InstagramCockpit } from './InstagramCockpit';

interface ContentDetailPanelProps {
  contentId: string;
  onUpdated: () => void;
}

export function ContentDetailPanel({ contentId, onUpdated }: ContentDetailPanelProps) {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [content, setContent] = useState<ContentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageGenProgress, setImageGenProgress] = useState('');

  const fetchContent = useCallback(async () => {
    if (!userId || !contentId) return;
    setLoading(true);
    try {
      const result = await marketingAPI.getContent(userId, contentId);
      setContent(result);
    } finally {
      setLoading(false);
    }
  }, [contentId, userId]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  if (loading || !content) {
    return <div className="p-6 text-sm text-app-muted">Loading content…</div>;
  }

  const isInstagram = (content.channel ?? '').toLowerCase() === 'instagram';

  return (
    <div className="p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="blue">{content.content_type}</Badge>
          <Badge variant={content.status === 'published' ? 'green' : 'default'}>{content.status}</Badge>
        </div>
        <h3 className="text-2xl font-semibold text-app-text">{content.title}</h3>
        <p className="text-sm text-app-muted mt-2">{content.channel || 'No channel'} • {content.campaign_name || 'No campaign'}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard icon={Calendar} label="Scheduled" value={content.scheduled_date || 'Unscheduled'} />
        <MetricCard icon={Globe} label="Views" value={content.views.toLocaleString()} />
        <MetricCard icon={Send} label="Leads" value={content.leads_attributed.toLocaleString()} />
      </div>

      {isInstagram ? (
        <InstagramCockpit
          caption={content.body ?? ''}
          imageUrl={content.image_url ?? null}
          imagePrompt={content.image_prompt ?? null}
          altText={content.visual_description ?? null}
          isGenerating={isGeneratingImage}
          progressMessage={imageGenProgress}
          contentId={content.id}
          onRegenerateImage={async (newPrompt, stylePreset) => {
            setIsGeneratingImage(true);
            setImageGenProgress('Regenerating visual…');
            try {
              const r = await marketingAPI.regenerateContentImage(userId, content.id, {
                image_prompt: newPrompt,
                style_preset: stylePreset,
              });
              if (r.success && r.image_url) {
                setContent((c) =>
                  c ? { ...c, image_url: r.image_url, image_prompt: newPrompt, visual_description: newPrompt } : c,
                );
                onUpdated();
              }
            } finally {
              setIsGeneratingImage(false);
              setImageGenProgress('');
            }
          }}
        />
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-app-muted mb-2">Body</p>
          <div className="text-sm text-app-text whitespace-pre-wrap">{content.body || 'No body yet.'}</div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <p className="text-xs uppercase tracking-wide text-app-muted mb-2">Tags</p>
        <p className="text-sm text-app-text">{content.tags.length > 0 ? content.tags.join(', ') : 'No tags.'}</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            void marketingAPI.publishContent(userId, content.id).then(() => {
              void fetchContent();
              onUpdated();
            });
          }}
          className="px-3 py-2 rounded-lg text-sm bg-primary-500 text-white"
        >
          Publish
        </button>
        <button
          onClick={() => {
            if (!content.scheduled_date) return;
            void marketingAPI.scheduleContent(userId, content.id, content.scheduled_date, content.scheduled_time || undefined).then(() => {
              void fetchContent();
              onUpdated();
            });
          }}
          className="px-3 py-2 rounded-lg text-sm bg-white/5 text-app-text"
        >
          Re-Schedule
        </button>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 text-app-muted text-xs uppercase tracking-wide">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <p className="text-xl font-semibold text-app-text mt-3">{value}</p>
    </div>
  );
}

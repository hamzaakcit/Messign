import { useEffect, useState, useCallback } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import { marketingAPI } from '@/lib/api';

interface Campaign {
  id: string;
  name: string;
  status: string;
  budget_eur?: number;
  actual_spend_eur?: number;
  channel?: string;
}

interface MarketingActionsProps {
  userId: string;
  onSuccess: () => void;
}

export function MarketingActions({ userId, onSuccess }: MarketingActionsProps): JSX.Element {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      const result = await marketingAPI.listCampaigns(userId);
      const items = (result as { data?: Campaign[] })?.data ?? [];
      setCampaigns(Array.isArray(items) ? items.slice(0, 10) : []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const handlePause = async (id: string): Promise<void> => {
    setActing(id);
    try {
      await marketingAPI.pauseCampaign(userId, id);
      toast.success('Campaign paused');
      loadCampaigns();
      onSuccess();
    } catch {
      toast.error('Failed to pause campaign');
    } finally {
      setActing(null);
    }
  };

  const handleLaunch = async (id: string): Promise<void> => {
    setActing(id);
    try {
      await marketingAPI.launchCampaign(userId, id);
      toast.success('Campaign launched');
      loadCampaigns();
      onSuccess();
    } catch {
      toast.error('Failed to launch campaign');
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-app-muted" /></div>;
  }

  if (campaigns.length === 0) {
    return <div className="text-center py-8 text-app-muted text-sm">No campaigns found</div>;
  }

  const STATUS_BADGE: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400',
    running: 'bg-emerald-500/20 text-emerald-400',
    paused: 'bg-amber-500/20 text-amber-400',
    draft: 'bg-slate-500/20 text-slate-400',
    completed: 'bg-blue-500/20 text-blue-400',
  };

  return (
    <div className="space-y-2" data-testid="marketing-actions">
      {campaigns.map((c) => (
        <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border border-app bg-app hover:bg-app-hover transition-colors">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-app truncate">{c.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS_BADGE[c.status] ?? 'bg-slate-500/20 text-slate-400'}`}>
                {c.status}
              </span>
            </div>
            <div className="text-xs text-app-muted">
              {c.channel ?? 'Multi-channel'} &middot; Budget: €{((c.budget_eur ?? 0)).toFixed(0)}
            </div>
          </div>
          <div className="flex items-center gap-1.5 ml-3">
            {(c.status === 'active' || c.status === 'running') && (
              <button
                onClick={() => handlePause(c.id)}
                disabled={acting === c.id}
                className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
              >
                {acting === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                Pause
              </button>
            )}
            {(c.status === 'paused' || c.status === 'draft') && (
              <button
                onClick={() => handleLaunch(c.id)}
                disabled={acting === c.id}
                className="flex items-center gap-1 px-2 py-1.5 rounded-md text-xs bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
              >
                {acting === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Launch
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

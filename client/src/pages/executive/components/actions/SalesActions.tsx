import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { crmAPI } from '@/lib/api';
import { ROUTES } from '@/lib/routes';

interface Deal {
  id: string;
  title: string;
  amount?: number;
  amount_eur?: number;
  probability?: number;
  stage_name?: string;
  owner_name?: string;
  company_name?: string;
}

interface SalesActionsProps {
  userId: string;
  onSuccess: () => void;
}

export function SalesActions({ userId, onSuccess }: SalesActionsProps): JSX.Element {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const loadDeals = useCallback(async () => {
    try {
      setLoading(true);
      const result = await crmAPI.listDeals(userId, { sort: 'updated_at', order: 'desc', limit: '10' });
      const items = (result as { data?: Deal[] })?.data ?? [];
      setDeals(Array.isArray(items) ? items : []);
    } catch {
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  const handleAdvance = async (dealId: string): Promise<void> => {
    setActing(dealId);
    try {
      const deal = deals.find((d) => d.id === dealId);
      if (!deal) return;
      const pipelines = await crmAPI.listPipelines(userId);
      if (!pipelines.length) { toast.error('No pipeline found'); return; }
      const stagesByPipeline = await crmAPI.getDealsByStage(userId, pipelines[0].id);
      const stageNames = Object.keys(stagesByPipeline);
      const currentIdx = stageNames.findIndex((s) => s === deal.stage_name);
      if (currentIdx >= 0 && currentIdx < stageNames.length - 1) {
        await crmAPI.updateDeal(userId, dealId, { stage_name: stageNames[currentIdx + 1] } as Partial<Deal>);
        toast.success(`Deal moved to ${stageNames[currentIdx + 1]}`);
        onSuccess();
        loadDeals();
      } else {
        toast.info('Deal is already at the final stage');
      }
    } catch {
      toast.error('Failed to update deal');
    } finally {
      setActing(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-app-muted" /></div>;
  }

  if (deals.length === 0) {
    return (
      <div className="text-center py-8 space-y-3">
        <p className="text-app-muted text-sm">No active deals</p>
        <Link to={ROUTES.CRM} className="text-xs text-primary-400 hover:text-primary-300">Open full CRM</Link>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="sales-actions">
      {deals.map((deal) => (
        <div key={deal.id} className="flex items-center justify-between p-3 rounded-lg border border-app bg-app hover:bg-app-hover transition-colors">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-app truncate">{deal.title}</div>
            <div className="text-xs text-app-muted">
              {deal.company_name ?? deal.owner_name ?? 'Unknown'} &middot;{' '}
              €{((deal.amount_eur ?? deal.amount ?? 0)).toFixed(0)} &middot; {deal.stage_name ?? 'Unknown Stage'}
            </div>
          </div>
          <button
            onClick={() => handleAdvance(deal.id)}
            disabled={acting === deal.id}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors disabled:opacity-50"
            title="Advance Stage"
          >
            {acting === deal.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            Advance
          </button>
        </div>
      ))}
    </div>
  );
}

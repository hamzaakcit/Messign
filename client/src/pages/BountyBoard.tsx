import { useState, useEffect, useCallback } from 'react';
import { Zap, Clock, Plus, Search, User, Gift } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { bountiesAPI } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { CreateBountyModal } from '@/components/bounties';
import { cn } from '@/lib/utils';

type BountyCategory = 'DESIGN' | 'CONTENT' | 'DEVELOPMENT' | 'DATA' | 'RESEARCH' | 'ADMIN' | 'OTHER';
type BountyUrgency = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

interface Bounty {
  id: string;
  title: string;
  description: string;
  category: BountyCategory;
  xp_reward: number;
  estimated_minutes: number;
  urgency: BountyUrgency;
  status: string;
  creator: { id: string; name: string; avatar?: string };
  claimedByUser?: { id: string; name: string; avatar?: string };
  department?: { id: string; name: string };
  expires_at?: string | null;
  created_at: string;
}

const CATEGORY_ICONS: Record<BountyCategory, string> = {
  DESIGN: '🎨',
  CONTENT: '✍️',
  DEVELOPMENT: '💻',
  DATA: '📊',
  RESEARCH: '🔍',
  ADMIN: '📋',
  OTHER: '📦',
};

const URGENCY_STYLES: Record<BountyUrgency, string> = {
  LOW: 'bg-gray-500/20 text-app-muted',
  NORMAL: 'bg-blue-500/20 text-blue-400',
  HIGH: 'bg-orange-500/20 text-orange-400',
  CRITICAL: 'bg-red-500/20 text-red-400',
};

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60 ? `${minutes % 60}m` : ''}`.trim();
}

export function BountyBoard() {
  const { user } = useAuthStore();
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterUrgency, setFilterUrgency] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const fetchBounties = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const params: { status?: string; category?: string; urgency?: string } = { status: 'OPEN' };
      if (filterCategory) params.category = filterCategory;
      if (filterUrgency) params.urgency = filterUrgency;
      const data = await bountiesAPI.list(params);
      setBounties(Array.isArray((data as { bounties?: Bounty[] }).bounties) ? (data as { bounties: Bounty[] }).bounties : []);
    } catch {
      setBounties([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, filterCategory, filterUrgency]);

  useEffect(() => {
    fetchBounties();
  }, [fetchBounties]);

  const handleClaim = async (id: string) => {
    setClaimingId(id);
    try {
      await bountiesAPI.claim(id);
      toast.success('Bounty claimed!');
      fetchBounties();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to claim');
    } finally {
      setClaimingId(null);
    }
  };

  const filtered = bounties.filter((b) => {
    const matchSearch = !search || b.title.toLowerCase().includes(search.toLowerCase()) || b.description.toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  if (!user?.id) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-app-muted">
        <p className="text-lg">Sign in to view the Bounty Board.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto bg-app transition-colors duration-200">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-app flex items-center gap-2">
              <Gift className="w-6 h-6 text-yellow-400" />
              Bounty Board
            </h1>
            <p className="text-app-muted text-sm mt-1">Quick tasks, quick MP. Grab a bounty and earn rewards.</p>
          </div>
          <Button type="button" variant="primary" onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Post Bounty
          </Button>
        </div>

        <div className="flex items-center gap-4 mb-6 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-muted pointer-events-none" />
            <Input
              placeholder="Search bounties..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-app-card border-app-border"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 rounded-lg border border-app-border bg-app-card text-app text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Filter by category"
          >
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_ICONS).map(([value, icon]) => (
              <option key={value} value={value}>
                {icon} {value}
              </option>
            ))}
          </select>
          <select
            value={filterUrgency}
            onChange={(e) => setFilterUrgency(e.target.value)}
            className="px-3 py-2 rounded-lg border border-app-border bg-app-card text-app text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Filter by urgency"
          >
            <option value="">Any Urgency</option>
            <option value="CRITICAL">🔴 Critical</option>
            <option value="HIGH">🟠 High</option>
            <option value="NORMAL">🔵 Normal</option>
            <option value="LOW">⚪ Low</option>
          </select>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-app-card border border-app-border rounded-xl h-48 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Gift className="w-16 h-16 mx-auto text-app-muted/50 mb-4" />
            <p className="text-app-muted text-lg">No bounties available</p>
            <p className="text-app-muted/80 text-sm mt-1">Be the first to post one!</p>
            <Button type="button" variant="primary" className="mt-4" onClick={() => setShowCreateModal(true)}>
              Post Bounty
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((bounty) => (
              <div
                key={bounty.id}
                className="bg-app-card border border-app-border rounded-xl p-4 hover:border-yellow-500/50 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{CATEGORY_ICONS[bounty.category] ?? '📦'}</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full', URGENCY_STYLES[bounty.urgency] ?? URGENCY_STYLES.NORMAL)}>
                      {bounty.urgency}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full text-sm font-medium">
                    <Zap className="w-3 h-3" />
                    {bounty.xp_reward} MP
                  </div>
                </div>
                <h3 className="font-medium text-app mb-2 line-clamp-1 group-hover:text-yellow-400 transition-colors">
                  {bounty.title}
                </h3>
                <p className="text-app-muted text-sm line-clamp-2 mb-3">{bounty.description}</p>
                <div className="flex items-center gap-3 text-xs text-app-muted mb-4">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    ~{formatTime(bounty.estimated_minutes)}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {bounty.creator?.name ?? 'Unknown'}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full gap-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border-0"
                  disabled={claimingId === bounty.id}
                  onClick={() => handleClaim(bounty.id)}
                >
                  <Zap className="w-4 h-4" />
                  {claimingId === bounty.id ? 'Claiming…' : 'Claim Bounty'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <CreateBountyModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={fetchBounties}
      />
    </div>
  );
}

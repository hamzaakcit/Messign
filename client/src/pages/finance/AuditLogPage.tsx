import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI, type AuditEntry } from '@/lib/financeApi';
import { Shield, Clock, Search, Filter, ChevronDown, CheckCircle, AlertTriangle, Info, Bot, User, Download, ChevronRight, Link2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

const severityColors: Record<string, string> = {
  info: 'text-primary-400 bg-primary-500/10',
  warning: 'text-amber-400 bg-amber-500/10',
  error: 'text-red-400 bg-red-500/10',
  critical: 'text-red-500 bg-red-500/20',
};

const categoryIcons: Record<string, typeof Shield> = {
  expense: Info,
  approval: CheckCircle,
  invoice: Info,
  budget: AlertTriangle,
  ai: Bot,
  auth: Shield,
};

const DATE_PRESETS = [
  { label: 'Today', getValue: () => { const d = new Date().toISOString().split('T')[0]; return { from: d, to: d }; } },
  { label: 'This Week', getValue: () => { const now = new Date(); const start = new Date(now); start.setDate(now.getDate() - now.getDay()); return { from: start.toISOString().split('T')[0], to: now.toISOString().split('T')[0] }; } },
  { label: 'This Month', getValue: () => { const now = new Date(); return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: now.toISOString().split('T')[0] }; } },
];

export function AuditLogPage() {
  const { user } = useAuthStore();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('');
  const [actorTypeFilter, setActorTypeFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chainVerification, setChainVerification] = useState<{ valid: boolean; brokenAt?: number } | null>(null);
  const [verifying, setVerifying] = useState(false);

  const userId = user?.authUserId || user?.id || '';

  const fetchEntries = () => {
    if (!userId) return;
    setLoading(true);
    const filters: Record<string, string> = { limit: '200' };
    if (categoryFilter !== 'all') filters.event_category = categoryFilter;
    if (searchTerm) filters.search = searchTerm;
    if (severityFilter) filters.severity = severityFilter;
    if (actorTypeFilter) filters.actor_type = actorTypeFilter;
    if (entityTypeFilter) filters.entity_type = entityTypeFilter;
    if (dateFrom) filters.date_from = dateFrom;
    if (dateTo) filters.date_to = dateTo;

    financeAPI.getAuditLog(userId, filters)
      .then((result) => {
        if (result && typeof result === 'object' && 'entries' in result) {
          setEntries(result.entries);
          setTotal(result.total);
        } else if (Array.isArray(result)) {
          setEntries(result as unknown as AuditEntry[]);
          setTotal((result as unknown[]).length);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchEntries(); }, [userId, categoryFilter, severityFilter, actorTypeFilter, entityTypeFilter, dateFrom, dateTo]);

  const handleSearch = () => fetchEntries();

  const verifyChain = async () => {
    setVerifying(true);
    try {
      const result = await financeAPI.verifyAuditChain(userId);
      setChainVerification(result);
    } catch {
      setChainVerification({ valid: false });
    }
    setVerifying(false);
  };

  useEffect(() => { if (userId) verifyChain(); }, [userId]);

  const handleExportCSV = () => {
    const headers = ['Timestamp', 'Event Type', 'Category', 'Actor Type', 'Actor ID', 'Entity Type', 'Entity ID', 'Severity', 'Flagged', 'Changes'];
    const rows = entries.map((e) => [
      new Date(e.created_at).toISOString(), e.event_type, e.event_category,
      e.actor_type, e.actor_id || '', e.entity_type, e.entity_id || '',
      e.severity || 'info', e.is_flagged ? 'Yes' : 'No',
      e.changes ? JSON.stringify(e.changes).slice(0, 500) : '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const applyDatePreset = (preset: typeof DATE_PRESETS[0]) => {
    const { from, to } = preset.getValue();
    setDateFrom(from);
    setDateTo(to);
  };

  const categories = Array.from(new Set(entries.map((e) => e.event_category)));
  const activeFilterCount = [severityFilter, actorTypeFilter, entityTypeFilter, dateFrom, dateTo].filter(Boolean).length;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Chain verification + toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {chainVerification && (
            <div className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border',
              chainVerification.valid ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400')}>
              {chainVerification.valid ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
              {chainVerification.valid ? 'Chain Verified' : `Chain Broken at #${chainVerification.brokenAt}`}
            </div>
          )}
          {verifying && <span className="text-xs text-app-muted">Verifying...</span>}
        </div>
        <button onClick={handleExportCSV}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-muted hover:bg-white/10 hover:text-app-text">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-app-muted" />
          <input type="text" placeholder="Search events..." value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text placeholder:text-app-muted focus:outline-none focus:ring-1 focus:ring-primary-500/50" />
        </div>
        <button onClick={() => setShowFilters(!showFilters)}
          className={cn('flex items-center gap-1 px-3 py-2 rounded-lg text-sm border transition-colors',
            showFilters || activeFilterCount > 0 ? 'bg-primary-500/10 border-primary-500/30 text-primary-400' : 'bg-white/5 border-white/10 text-app-muted hover:text-app-text')}>
          <Filter className="h-4 w-4" /> Filters
          {activeFilterCount > 0 && <span className="px-1.5 py-0.5 rounded-full bg-primary-500 text-app-text text-xs">{activeFilterCount}</span>}
        </button>
      </div>

      {/* Category chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setCategoryFilter('all')}
          className={cn('px-3 py-1 rounded-full text-xs transition-colors', categoryFilter === 'all' ? 'bg-primary-500 text-app-text' : 'bg-white/5 text-app-muted hover:text-app-text')}>
          All
        </button>
        {categories.map((cat) => (
          <button key={cat} onClick={() => setCategoryFilter(cat)}
            className={cn('px-3 py-1 rounded-full text-xs capitalize transition-colors', categoryFilter === cat ? 'bg-primary-500 text-app-text' : 'bg-white/5 text-app-muted hover:text-app-text')}>
            {cat}
          </button>
        ))}
      </div>

      {/* Advanced filters */}
      {showFilters && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs text-app-muted mb-1">Date From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Date To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Severity</label>
              <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none">
                <option value="">All</option>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Actor Type</label>
              <select value={actorTypeFilter} onChange={(e) => setActorTypeFilter(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none">
                <option value="">All</option>
                <option value="user">User</option>
                <option value="ai">AI</option>
                <option value="system">System</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-app-muted mb-1">Entity Type</label>
              <select value={entityTypeFilter} onChange={(e) => setEntityTypeFilter(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-app-text focus:outline-none">
                <option value="">All</option>
                <option value="expense">Expense</option>
                <option value="invoice">Invoice</option>
                <option value="budget">Budget</option>
                <option value="payment">Payment</option>
                <option value="vendor">Vendor</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-app-muted">Quick:</span>
            {DATE_PRESETS.map((preset) => (
              <button key={preset.label} onClick={() => applyDatePreset(preset)}
                className="px-2 py-0.5 text-xs rounded bg-white/5 text-app-muted hover:text-app-text hover:bg-white/10">
                {preset.label}
              </button>
            ))}
            {activeFilterCount > 0 && (
              <button onClick={() => { setSeverityFilter(''); setActorTypeFilter(''); setEntityTypeFilter(''); setDateFrom(''); setDateTo(''); }}
                className="text-xs text-primary-400 hover:text-primary-300 ml-auto">Clear all</button>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs text-app-muted">Total Events</p>
          <p className="text-xl font-bold text-app-text">{total || entries.length}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs text-app-muted">Flagged</p>
          <p className="text-xl font-bold text-red-400">{entries.filter((e) => e.is_flagged).length}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs text-app-muted">AI Actions</p>
          <p className="text-xl font-bold text-primary-400">{entries.filter((e) => e.actor_type === 'ai').length}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-xs text-app-muted">Categories</p>
          <p className="text-xl font-bold text-app-text">{categories.length}</p>
        </div>
      </div>

      {/* Log entries */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        {loading ? (
          <div className="space-y-0">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex gap-3 px-4 py-3 border-b border-white/5">
                <div className="w-8 h-8 bg-white/5 rounded-lg animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-white/5 rounded w-1/3 animate-pulse" />
                  <div className="h-3 bg-white/5 rounded w-1/2 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12">
            <Shield className="h-10 w-10 mx-auto text-app-muted mb-3 opacity-40" />
            <p className="text-sm text-app-muted">No audit events found.</p>
            <p className="text-xs text-app-muted mt-1">Try adjusting your filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {entries.slice(0, 100).map((entry) => {
              const Icon = categoryIcons[entry.event_category] ?? Info;
              const sev = entry.severity ?? 'info';
              const isExpanded = expandedId === entry.id;
              return (
                <div key={entry.id}>
                  <div onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className={cn('flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer', entry.is_flagged && 'bg-red-500/[0.03]')}>
                    <div className={cn('p-1.5 rounded-lg mt-0.5', severityColors[sev])}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-app-text">
                          {entry.event_type.replace(/\./g, ' > ').replace(/_/g, ' ')}
                        </span>
                        <div className="flex items-center gap-2">
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-app-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-app-muted" />}
                          <span className="text-xs text-app-muted flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(entry.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-app-muted">
                        <span className="flex items-center gap-1">
                          {entry.actor_type === 'ai' ? <Bot className="h-3 w-3" /> : entry.actor_type === 'system' ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
                          {entry.actor_type}{entry.actor_name ? ` (${entry.actor_name})` : ''}
                        </span>
                        <span>·</span>
                        <span>{entry.entity_type}: {entry.entity_id?.slice(0, 8)}...</span>
                        {entry.severity && entry.severity !== 'info' && (
                          <>
                            <span>·</span>
                            <span className={cn('capitalize font-medium', severityColors[entry.severity]?.split(' ')[0])}>{entry.severity}</span>
                          </>
                        )}
                        {entry.is_flagged && (
                          <>
                            <span>·</span>
                            <span className="text-red-400 font-medium">Flagged</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 ml-10 space-y-3">
                      {entry.changes && Object.keys(entry.changes).length > 0 && (
                        <div>
                          <p className="text-xs text-app-muted uppercase mb-1">Changes</p>
                          <div className="rounded-lg bg-white/5 p-3 text-xs font-mono text-app-muted overflow-x-auto">
                            {Object.entries(entry.changes).map(([key, val]) => (
                              <div key={key} className="flex gap-2">
                                <span className="text-primary-400">{key}:</span>
                                <span className="text-app-text">{JSON.stringify(val)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <div>
                          <p className="text-xs text-app-muted uppercase mb-1">Metadata</p>
                          <div className="rounded-lg bg-white/5 p-3 text-xs font-mono text-app-muted">
                            {JSON.stringify(entry.metadata, null, 2)}
                          </div>
                        </div>
                      )}
                      {entry.ai_involved && (
                        <div className="flex items-center gap-4 text-xs">
                          {entry.ai_confidence != null && (
                            <span className="text-app-muted">AI Confidence: <span className="text-primary-400 font-medium">{(entry.ai_confidence * 100).toFixed(0)}%</span></span>
                          )}
                          {entry.ai_reasoning && (
                            <span className="text-app-muted">Reasoning: <span className="text-app-text">{entry.ai_reasoning}</span></span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-4 text-xs text-app-muted">
                        <span>ID: <span className="font-mono">{entry.id.slice(0, 12)}...</span></span>
                        {entry.ip_address && <span>IP: {entry.ip_address}</span>}
                        {entry.event_hash && <span className="flex items-center gap-1"><Link2 className="h-3 w-3" /> {entry.event_hash.slice(0, 16)}...</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {entries.length > 100 && (
        <p className="text-xs text-center text-app-muted">Showing 100 of {entries.length} entries</p>
      )}
    </div>
  );
}

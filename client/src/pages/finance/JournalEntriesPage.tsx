import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI, type JournalEntry } from '@/lib/financeApi';
import { StatusBadge } from '@/components/finance/StatusBadge';
import { cn } from '@/lib/utils';
import {
  Search, Filter, ChevronDown, ChevronRight, Zap, RotateCcw,
  Plus, X, Check, Trash2, Loader2,
} from 'lucide-react';

const SOURCE_LABELS: Record<string, string> = {
  expense_approved: 'Expense Approved',
  expense_paid: 'Expense Paid',
  invoice_sent: 'Invoice Sent',
  invoice_paid: 'Invoice Paid',
  payment_completed: 'Payment Completed',
  manual: 'Manual',
  period_close: 'Period Close',
  void_reversal: 'Void Reversal',
};

interface JELine {
  key: string;
  gl_code: string;
  debit: number;
  credit: number;
  description: string;
}
const newLineKey = () => Math.random().toString(36).slice(2, 8);

export function JournalEntriesPage() {
  const { user } = useAuthStore();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [glAccounts, setGlAccounts] = useState<Array<{ id: string; code: string; name: string; type: string }>>([]);
  const [jeForm, setJeForm] = useState({ description: '', entry_date: new Date().toISOString().split('T')[0], reference: '' });
  const [jeLines, setJeLines] = useState<JELine[]>([
    { key: newLineKey(), gl_code: '', debit: 0, credit: 0, description: '' },
    { key: newLineKey(), gl_code: '', debit: 0, credit: 0, description: '' },
  ]);
  const [jeSaving, setJeSaving] = useState(false);
  const [jeError, setJeError] = useState('');

  const fetchEntries = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { ...filters };
      if (search) params.search = search;
      const result = await financeAPI.listJournalEntries(user.id, params);
      setEntries(result.entries);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to load journal entries:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, filters, search]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const handleVoid = async (id: string) => {
    if (!user?.id || !confirm('Void this journal entry? A reversing entry will be created.')) return;
    try {
      await financeAPI.voidJournalEntry(user.id, id);
      fetchEntries();
    } catch (err) {
      console.error('Failed to void entry:', err);
    }
  };

  const openNewEntry = async () => {
    setJeForm({ description: '', entry_date: new Date().toISOString().split('T')[0], reference: '' });
    setJeLines([
      { key: newLineKey(), gl_code: '', debit: 0, credit: 0, description: '' },
      { key: newLineKey(), gl_code: '', debit: 0, credit: 0, description: '' },
    ]);
    setJeError('');
    setModalOpen(true);
    if (glAccounts.length === 0 && user?.id) {
      try {
        const accounts = await financeAPI.listGLAccounts(user.id);
        setGlAccounts(accounts.filter((a: any) => a.is_active));
      } catch { /* empty */ }
    }
  };

  const updateLine = (key: string, field: keyof JELine, value: string | number) => {
    setJeLines(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l));
  };

  const addLine = () => setJeLines(prev => [...prev, { key: newLineKey(), gl_code: '', debit: 0, credit: 0, description: '' }]);
  const removeLine = (key: string) => { if (jeLines.length > 2) setJeLines(prev => prev.filter(l => l.key !== key)); };

  const totalDebit = jeLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = jeLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const handleSaveEntry = async () => {
    if (!user?.id) return;
    if (!jeForm.description.trim()) { setJeError('Description is required'); return; }
    if (!isBalanced) { setJeError('Total debits must equal total credits'); return; }
    const emptyLines = jeLines.filter(l => !l.gl_code);
    if (emptyLines.length > 0) { setJeError('All lines must have a GL account selected'); return; }

    setJeSaving(true);
    setJeError('');
    try {
      await financeAPI.createJournalEntry(user.id, {
        description: jeForm.description,
        entry_date: jeForm.entry_date,
        reference: jeForm.reference || undefined,
        lines: jeLines.map(l => ({
          gl_code: l.gl_code,
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description || undefined,
        })),
      });
      setModalOpen(false);
      fetchEntries();
    } catch (err) {
      setJeError(err instanceof Error ? err.message : 'Failed to create entry');
    }
    setJeSaving(false);
  };

  const periodOptions = (() => {
    const now = new Date();
    const options: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return options;
  })();

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-14 rounded-lg bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={openNewEntry}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 transition-colors"
        >
          <Plus className="h-4 w-4" /> New Entry
        </button>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-app-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search entries..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none"
          />
        </div>
        <select
          value={filters.period || ''}
          onChange={e => setFilters(f => ({ ...f, period: e.target.value }))}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none"
        >
          <option value="">All Periods</option>
          {periodOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={filters.source_type || ''}
          onChange={e => setFilters(f => ({ ...f, source_type: e.target.value }))}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none"
        >
          <option value="">All Sources</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          value={filters.status || ''}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="posted">Posted</option>
          <option value="voided">Voided</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      <p className="text-xs text-app-muted">{total} entries found</p>

      <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-app-muted text-xs border-b border-white/10">
              <th className="text-left px-4 py-3 font-medium w-8"></th>
              <th className="text-left px-4 py-3 font-medium">Entry #</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Description</th>
              <th className="text-left px-4 py-3 font-medium">Source</th>
              <th className="text-right px-4 py-3 font-medium">Debit</th>
              <th className="text-right px-4 py-3 font-medium">Credit</th>
              <th className="text-center px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <>
                <tr
                  key={entry.id}
                  className={cn('border-t border-white/5 hover:bg-white/5 cursor-pointer transition-colors',
                    entry.status === 'voided' && 'opacity-50')}
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  <td className="px-4 py-3">
                    {expandedId === entry.id ? <ChevronDown className="h-4 w-4 text-app-muted" /> : <ChevronRight className="h-4 w-4 text-app-muted" />}
                  </td>
                  <td className="px-4 py-3 font-mono text-app-text">{entry.entry_number}</td>
                  <td className="px-4 py-3 text-app-muted">{entry.entry_date}</td>
                  <td className="px-4 py-3 text-app-text max-w-[200px] truncate">
                    <div className="flex items-center gap-2">
                      {entry.is_auto_generated && <Zap className="h-3.5 w-3.5 text-yellow-400 shrink-0" title="Auto-generated" />}
                      <span className="truncate">{entry.description}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-app-muted px-2 py-0.5 rounded bg-white/5">
                      {SOURCE_LABELS[entry.source_type] || entry.source_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-app-text">${parseFloat(String(entry.total_debit)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right font-mono text-app-text">${parseFloat(String(entry.total_credit)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={entry.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {entry.status === 'posted' && (
                      <button
                        onClick={e => { e.stopPropagation(); handleVoid(entry.id); }}
                        className="p-1 text-app-muted hover:text-red-400 rounded"
                        title="Void Entry"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
                {expandedId === entry.id && entry.lines && (
                  <tr key={`${entry.id}-lines`}>
                    <td colSpan={9} className="px-8 py-3 bg-white/[0.02]">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-app-muted">
                            <th className="text-left py-1 font-medium">GL Code</th>
                            <th className="text-left py-1 font-medium">Account</th>
                            <th className="text-left py-1 font-medium">Description</th>
                            <th className="text-right py-1 font-medium">Debit</th>
                            <th className="text-right py-1 font-medium">Credit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.lines.map((line, i) => (
                            <tr key={i} className="border-t border-white/5">
                              <td className="py-1.5 font-mono">{line.gl_code}</td>
                              <td className="py-1.5 text-app-text">{line.gl_name}</td>
                              <td className="py-1.5 text-app-muted">{line.description || '-'}</td>
                              <td className="py-1.5 text-right font-mono">{parseFloat(String(line.debit_amount)) > 0 ? `$${parseFloat(String(line.debit_amount)).toFixed(2)}` : '-'}</td>
                              <td className="py-1.5 text-right font-mono">{parseFloat(String(line.credit_amount)) > 0 ? `$${parseFloat(String(line.credit_amount)).toFixed(2)}` : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {entries.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-app-muted">No journal entries found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* New Journal Entry Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setModalOpen(false)}>
          <div className="bg-app-card border border-white/10 rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-app-text">New Journal Entry</h3>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded hover:bg-white/10 text-app-muted"><X className="h-4 w-4" /></button>
            </div>

            {jeError && <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-400">{jeError}</div>}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="col-span-2">
                <label className="block text-xs text-app-muted mb-1">Description *</label>
                <input type="text" value={jeForm.description} onChange={(e) => setJeForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none"
                  placeholder="e.g. Monthly rent accrual" />
              </div>
              <div>
                <label className="block text-xs text-app-muted mb-1">Date</label>
                <input type="date" value={jeForm.entry_date} onChange={(e) => setJeForm(f => ({ ...f, entry_date: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-app-muted mb-1">Reference</label>
                <input type="text" value={jeForm.reference} onChange={(e) => setJeForm(f => ({ ...f, reference: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none"
                  placeholder="Optional reference" />
              </div>
            </div>

            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs text-app-muted font-medium uppercase tracking-wide">Lines</label>
              <button onClick={addLine} className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors">
                <Plus className="h-3 w-3" /> Add Line
              </button>
            </div>

            <div className="rounded-lg border border-white/10 overflow-hidden mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-app-muted border-b border-white/10 bg-white/[0.02]">
                    <th className="text-left px-3 py-2 font-medium">Account</th>
                    <th className="text-left px-3 py-2 font-medium w-24">Debit</th>
                    <th className="text-left px-3 py-2 font-medium w-24">Credit</th>
                    <th className="text-left px-3 py-2 font-medium">Memo</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {jeLines.map((line) => (
                    <tr key={line.key}>
                      <td className="px-3 py-1.5">
                        <select value={line.gl_code} onChange={(e) => updateLine(line.key, 'gl_code', e.target.value)}
                          className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none">
                          <option value="">Select account...</option>
                          {glAccounts.map(a => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" min={0} step={0.01} value={line.debit || ''} placeholder="0.00"
                          onChange={(e) => updateLine(line.key, 'debit', Number(e.target.value) || 0)}
                          className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-sm text-app-text text-right focus:border-primary-500 focus:outline-none" />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="number" min={0} step={0.01} value={line.credit || ''} placeholder="0.00"
                          onChange={(e) => updateLine(line.key, 'credit', Number(e.target.value) || 0)}
                          className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-sm text-app-text text-right focus:border-primary-500 focus:outline-none" />
                      </td>
                      <td className="px-3 py-1.5">
                        <input type="text" value={line.description} placeholder="Line memo"
                          onChange={(e) => updateLine(line.key, 'description', e.target.value)}
                          className="w-full px-2 py-1 rounded bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none" />
                      </td>
                      <td className="px-1 py-1.5">
                        {jeLines.length > 2 && (
                          <button onClick={() => removeLine(line.key)} className="p-1 text-app-muted hover:text-red-400 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/10 bg-white/[0.02]">
                    <td className="px-3 py-2 text-xs font-medium text-app-muted text-right">Totals</td>
                    <td className="px-3 py-2 text-sm font-mono text-right text-app-text">${totalDebit.toFixed(2)}</td>
                    <td className="px-3 py-2 text-sm font-mono text-right text-app-text">${totalCredit.toFixed(2)}</td>
                    <td className="px-3 py-2">
                      {totalDebit > 0 && (
                        <span className={cn('text-xs font-medium', isBalanced ? 'text-emerald-400' : 'text-red-400')}>
                          {isBalanced ? 'Balanced' : `Diff: $${Math.abs(totalDebit - totalCredit).toFixed(2)}`}
                        </span>
                      )}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-app-muted hover:text-app-text hover:bg-white/10 transition-colors">Cancel</button>
              <button onClick={handleSaveEntry} disabled={jeSaving || !isBalanced}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary-500 text-white text-sm font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors">
                {jeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {jeSaving ? 'Posting...' : 'Post Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

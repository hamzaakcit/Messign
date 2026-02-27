import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI } from '@/lib/financeApi';
import { cn } from '@/lib/utils';
import { Loader2, Scale, Download, CheckCircle, AlertTriangle } from 'lucide-react';

interface BalanceSheetData {
  assets: Array<{ code: string; name: string; balance: number }>;
  liabilities: Array<{ code: string; name: string; balance: number }>;
  equity: Array<{ code: string; name: string; balance: number }>;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  asOfDate: string;
}

export function BalanceSheetPage() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.authUserId || user?.id || '';
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    financeAPI.getBalanceSheet(userId, asOfDate)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [userId, asOfDate]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);

  const handleExport = () => {
    if (!data) return;
    const lines = [
      `Balance Sheet as of ${data.asOfDate}`,
      '',
      'ASSETS',
      'Code,Account,Balance',
      ...data.assets.map((a) => `${a.code},${a.name},${a.balance.toFixed(2)}`),
      `,,Total Assets: ${data.totalAssets.toFixed(2)}`,
      '',
      'LIABILITIES',
      'Code,Account,Balance',
      ...data.liabilities.map((l) => `${l.code},${l.name},${l.balance.toFixed(2)}`),
      `,,Total Liabilities: ${data.totalLiabilities.toFixed(2)}`,
      '',
      'EQUITY',
      'Code,Account,Balance',
      ...data.equity.map((e) => `${e.code},${e.name},${e.balance.toFixed(2)}`),
      `,,Total Equity: ${data.totalEquity.toFixed(2)}`,
      '',
      `,,Total Liabilities + Equity: ${data.totalLiabilitiesAndEquity.toFixed(2)}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `balance-sheet-${data.asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scale className="h-5 w-5 text-app-muted" />
          <h3 className="text-lg font-semibold text-app-text">Balance Sheet</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-app-muted">As of</label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-app-text focus:border-primary-500 focus:outline-none"
            />
          </div>
          <button
            onClick={handleExport}
            disabled={!data}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-app-muted hover:text-app-text hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {data && (
        <div className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium',
          data.isBalanced
            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border border-red-500/30 text-red-400',
        )}>
          {data.isBalanced
            ? <><CheckCircle className="h-4 w-4" /> Balance sheet is balanced</>
            : <><AlertTriangle className="h-4 w-4" /> Balance sheet is not balanced (difference: {fmt(data.totalAssets - data.totalLiabilitiesAndEquity)})</>
          }
        </div>
      )}

      {!data ? (
        <div className="text-center py-10 text-app-muted text-sm">No data available.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Assets */}
          <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="px-5 py-3 border-b border-white/10 bg-blue-500/5">
              <h4 className="text-sm font-semibold text-blue-400 uppercase tracking-wide">Assets</h4>
            </div>
            <div className="divide-y divide-white/5">
              {data.assets.length === 0 ? (
                <div className="px-5 py-4 text-sm text-app-muted">No asset accounts with balances.</div>
              ) : (
                data.assets.map((a) => (
                  <div key={a.code} className="px-5 py-2.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-app-muted text-xs font-mono w-12 shrink-0">{a.code}</span>
                      <span className="text-app-text truncate">{a.name}</span>
                    </div>
                    <span className="font-medium text-app-text shrink-0 ml-2">{fmt(a.balance)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="px-5 py-3 border-t border-white/10 flex justify-between items-center bg-blue-500/5">
              <span className="text-sm font-semibold text-blue-400">Total Assets</span>
              <span className="text-sm font-bold text-blue-400">{fmt(data.totalAssets)}</span>
            </div>
          </div>

          {/* Liabilities + Equity */}
          <div className="space-y-6">
            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="px-5 py-3 border-b border-white/10 bg-amber-500/5">
                <h4 className="text-sm font-semibold text-amber-400 uppercase tracking-wide">Liabilities</h4>
              </div>
              <div className="divide-y divide-white/5">
                {data.liabilities.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-app-muted">No liability accounts with balances.</div>
                ) : (
                  data.liabilities.map((l) => (
                    <div key={l.code} className="px-5 py-2.5 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-app-muted text-xs font-mono w-12 shrink-0">{l.code}</span>
                        <span className="text-app-text truncate">{l.name}</span>
                      </div>
                      <span className="font-medium text-app-text shrink-0 ml-2">{fmt(l.balance)}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="px-5 py-3 border-t border-white/10 flex justify-between items-center bg-amber-500/5">
                <span className="text-sm font-semibold text-amber-400">Total Liabilities</span>
                <span className="text-sm font-bold text-amber-400">{fmt(data.totalLiabilities)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="px-5 py-3 border-b border-white/10 bg-emerald-500/5">
                <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wide">Equity</h4>
              </div>
              <div className="divide-y divide-white/5">
                {data.equity.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-app-muted">No equity accounts with balances.</div>
                ) : (
                  data.equity.map((e) => (
                    <div key={e.code} className="px-5 py-2.5 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-app-muted text-xs font-mono w-12 shrink-0">{e.code}</span>
                        <span className="text-app-text truncate">{e.name}</span>
                      </div>
                      <span className="font-medium text-app-text shrink-0 ml-2">{fmt(e.balance)}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="px-5 py-3 border-t border-white/10 flex justify-between items-center bg-emerald-500/5">
                <span className="text-sm font-semibold text-emerald-400">Total Equity</span>
                <span className="text-sm font-bold text-emerald-400">{fmt(data.totalEquity)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 flex justify-between items-center">
              <span className="text-sm font-semibold text-app-text">Total Liabilities + Equity</span>
              <span className="text-sm font-bold text-app-text">{fmt(data.totalLiabilitiesAndEquity)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChartOfAccountsPage } from './ChartOfAccountsPage';
import { JournalEntriesPage } from './JournalEntriesPage';
import { ProfitLossPage } from './ProfitLossPage';
import { BalanceSheetPage } from './BalanceSheetPage';
import { TaxRatesPage } from './TaxRatesPage';
import { APAgingPage } from './APAgingPage';
import { ARAgingPage } from './ARAgingPage';
import { PeriodClosePage } from './PeriodClosePage';
import {
  BookOpen,
  FileSpreadsheet,
  TrendingUp,
  Scale,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck,
} from 'lucide-react';

type AccountingTab = 'coa' | 'journal' | 'pl' | 'balance-sheet' | 'tax' | 'ap' | 'ar' | 'period-close';

const TABS: { id: AccountingTab; label: string; icon: typeof BookOpen }[] = [
  { id: 'coa', label: 'Chart of Accounts', icon: BookOpen },
  { id: 'journal', label: 'Journal Entries', icon: FileSpreadsheet },
  { id: 'pl', label: 'P&L Statement', icon: TrendingUp },
  { id: 'balance-sheet', label: 'Balance Sheet', icon: Scale },
  { id: 'tax', label: 'Tax Rates', icon: Receipt },
  { id: 'ap', label: 'AP Aging', icon: ArrowDownLeft },
  { id: 'ar', label: 'AR Aging', icon: ArrowUpRight },
  { id: 'period-close', label: 'Period Close', icon: CalendarCheck },
];

export function AccountingPage() {
  const [tab, setTab] = useState<AccountingTab>('coa');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
              tab === id
                ? 'bg-primary-500/20 text-primary-400'
                : 'text-app-muted hover:text-app-text hover:bg-app-nav-hover',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'coa' && <ChartOfAccountsPage />}
      {tab === 'journal' && <JournalEntriesPage />}
      {tab === 'pl' && <ProfitLossPage />}
      {tab === 'balance-sheet' && <BalanceSheetPage />}
      {tab === 'tax' && <TaxRatesPage />}
      {tab === 'ap' && <APAgingPage />}
      {tab === 'ar' && <ARAgingPage />}
      {tab === 'period-close' && <PeriodClosePage />}
    </div>
  );
}

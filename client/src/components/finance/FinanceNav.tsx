import { cn } from '@/lib/utils';
import { useFinanceStore, type FinanceView } from '@/stores/financeStore';
import {
  LayoutDashboard,
  Wallet,
  FileText,
  PiggyBank,
  Users,
  CreditCard,
  BookOpen,
  BarChart3,
  Shield,
  Settings,
  DollarSign,
} from 'lucide-react';

interface NavSection {
  label?: string;
  items: { id: FinanceView; label: string; icon: typeof LayoutDashboard }[];
}

const SECTIONS: NavSection[] = [
  {
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'expenses', label: 'Expenses', icon: Wallet },
      { id: 'invoices', label: 'Invoices', icon: FileText },
      { id: 'payments', label: 'Payments', icon: CreditCard },
      { id: 'budgets', label: 'Budgets', icon: PiggyBank },
      { id: 'vendors', label: 'Vendors', icon: Users },
    ],
  },
  {
    label: 'Accounting',
    items: [
      { id: 'accounting', label: 'Accounting', icon: BookOpen },
      { id: 'reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'audit', label: 'Audit Log', icon: Shield },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function FinanceNav() {
  const { activeView, setActiveView } = useFinanceStore();

  return (
    <nav className="w-56 shrink-0 border-r border-white/10 flex flex-col h-full overflow-y-auto">
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary-500/15">
            <DollarSign className="h-5 w-5 text-primary-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-app-text leading-tight">Finance</h2>
            <p className="text-[11px] text-app-muted leading-tight">Management</p>
          </div>
        </div>
      </div>

      <div className="flex-1 py-3 space-y-4">
        {SECTIONS.map((section, si) => (
          <div key={si}>
            {section.label && (
              <p className="px-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-app-muted/60">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5 px-2">
              {section.items.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveView(id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
                    activeView === id
                      ? 'bg-primary-500/15 text-primary-400'
                      : 'text-app-muted hover:text-app-text hover:bg-white/5',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}

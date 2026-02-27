import { create } from 'zustand';
import type { Expense, DashboardMetrics, FinanceNotification, ExpenseListResult } from '../lib/financeApi';

export type FinanceView = 'overview' | 'expenses' | 'invoices' | 'budgets' | 'vendors' | 'payments' | 'accounting' | 'reports' | 'audit' | 'settings';

export interface ExpenseFilters {
  status?: string;
  category_slug?: string;
  date_from?: string;
  date_to?: string;
  amount_min?: string;
  amount_max?: string;
  risk_level?: string;
  search?: string;
  sort_by?: string;
  sort_dir?: string;
}

interface FinanceState {
  activeView: FinanceView;
  setActiveView: (v: FinanceView) => void;

  dashboardMetrics: DashboardMetrics | null;
  setDashboardMetrics: (m: DashboardMetrics) => void;

  expenses: Expense[];
  expensesTotal: number;
  expensesPage: number;
  expenseFilters: ExpenseFilters;
  selectedExpenseIds: string[];
  setExpenses: (result: ExpenseListResult) => void;
  setExpenseFilters: (f: Partial<ExpenseFilters>) => void;
  setExpensesPage: (p: number) => void;
  toggleExpenseSelection: (id: string) => void;
  clearExpenseSelection: () => void;
  selectAllExpenses: () => void;

  currentExpense: Expense | null;
  setCurrentExpense: (e: Expense | null) => void;

  notifications: FinanceNotification[];
  unreadCount: number;
  setNotifications: (n: FinanceNotification[], count: number) => void;
  addNotification: (n: FinanceNotification) => void;
  markRead: (id: string) => void;
}

export const useFinanceStore = create<FinanceState>((set) => ({
  activeView: 'overview',
  setActiveView: (v) => set({ activeView: v }),

  dashboardMetrics: null,
  setDashboardMetrics: (m) => set({ dashboardMetrics: m }),

  expenses: [],
  expensesTotal: 0,
  expensesPage: 0,
  expenseFilters: {},
  selectedExpenseIds: [],
  setExpenses: (result) =>
    set({ expenses: result.expenses, expensesTotal: result.total, expensesPage: result.offset }),
  setExpenseFilters: (f) =>
    set((state) => ({ expenseFilters: { ...state.expenseFilters, ...f } })),
  setExpensesPage: (p) => set({ expensesPage: p }),
  toggleExpenseSelection: (id) =>
    set((state) => {
      const selected = state.selectedExpenseIds.includes(id)
        ? state.selectedExpenseIds.filter((x) => x !== id)
        : [...state.selectedExpenseIds, id];
      return { selectedExpenseIds: selected };
    }),
  clearExpenseSelection: () => set({ selectedExpenseIds: [] }),
  selectAllExpenses: () =>
    set((state) => ({ selectedExpenseIds: state.expenses.map((e) => e.id) })),

  currentExpense: null,
  setCurrentExpense: (e) => set({ currentExpense: e }),

  notifications: [],
  unreadCount: 0,
  setNotifications: (n, count) => set({ notifications: n, unreadCount: count }),
  addNotification: (n) =>
    set((state) => ({
      notifications: [n, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    })),
  markRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n,
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),
}));

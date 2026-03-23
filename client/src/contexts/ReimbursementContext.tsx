import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { reimbursementAPI, approvalsAPI } from '@/lib/api';

interface ReimbursementContextType {
  myPendingCount: number;
  myPendingTotal: number;
  pendingApprovalsCount: number;
  refreshCounts: () => Promise<void>;
  showApprovals: boolean;
}

const ReimbursementContext = createContext<ReimbursementContextType | null>(null);

export function ReimbursementProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [myPendingCount, setMyPendingCount] = useState(0);
  const [myPendingTotal, setMyPendingTotal] = useState(0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);

  const refreshCounts = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [reimb, approvals] = (await Promise.all([
        reimbursementAPI.getCounts(user.id),
        approvalsAPI.getCounts(user.id),
      ])) as [{ myPendingCount?: number; myPendingTotal?: number }, { pendingApprovalsCount?: number }];
      setMyPendingCount(reimb.myPendingCount ?? 0);
      setMyPendingTotal(reimb.myPendingTotal ?? 0);
      setPendingApprovalsCount(approvals.pendingApprovalsCount ?? 0);
    } catch {
      setMyPendingCount(0);
      setMyPendingTotal(0);
      setPendingApprovalsCount(0);
    }
  }, [user?.id]);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  const showApprovals = isAdmin || (user as { role?: string })?.role === 'manager';

  const value = useMemo(() => ({
    myPendingCount,
    myPendingTotal,
    pendingApprovalsCount,
    refreshCounts,
    showApprovals,
  }), [myPendingCount, myPendingTotal, pendingApprovalsCount, refreshCounts, showApprovals]);

  return (
    <ReimbursementContext.Provider value={value}>
      {children}
    </ReimbursementContext.Provider>
  );
}

export function useReimbursementContext() {
  const ctx = useContext(ReimbursementContext);
  return ctx;
}

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useDashboardStore } from '@/stores/dashboardStore';
import { dashboardAPI } from '@/lib/api';

export interface TrendDataPoint {
  period: string;
  value: number;
}

export function useTrendData() {
  const user = useAuthStore((s) => s.user);
  const activeMetric = useDashboardStore((s) => s.activeMetric);
  const activeEntity = useDashboardStore((s) => s.activeEntity);
  const timeRange = useDashboardStore((s) => s.timeRange);
  const [data, setData] = useState<TrendDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      setData([]);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;

    setLoading(true);
    setError(null);

    dashboardAPI.getTrends(user.id, {
      metric: activeMetric,
      entityId: activeEntity,
      range: timeRange,
    })
      .then((res) => {
        if (cancelled) return;
        const points = (res as { success: boolean; data: TrendDataPoint[] }).data ?? [];
        setData(Array.isArray(points) ? points : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load trends');
        setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [user?.id, activeMetric, activeEntity, timeRange]);

  return { data, loading, error };
}

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useDashboardStore } from '@/stores/dashboardStore';
import { dashboardAPI } from '@/lib/api';

export interface TrendDataPoint {
  period: string;
  value: number;
}

export function useTrendData() {
  const { user } = useAuthStore();
  const { activeMetric, activeEntity, timeRange } = useDashboardStore();
  const [data, setData] = useState<TrendDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrends = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      setData([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardAPI.getTrends(user.id, {
        metric: activeMetric,
        entityId: activeEntity,
        range: timeRange,
      });
      const points = (res as { success: boolean; data: TrendDataPoint[] }).data ?? [];
      setData(Array.isArray(points) ? points : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trends');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeMetric, activeEntity, timeRange]);

  useEffect(() => {
    fetchTrends();
  }, [fetchTrends]);

  return { data, loading, error };
}

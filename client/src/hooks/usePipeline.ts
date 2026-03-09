import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { crmAPI } from '@/lib/crmApi';
import type { Pipeline, Deal, DealStage, SalesMetrics } from '@/lib/crmApi';

export interface UsePipelineReturn {
  pipelines: Pipeline[];
  activePipelineId: string | null;
  setActivePipelineId: (id: string) => void;
  stages: DealStage[];
  dealsByStage: Map<string, Deal[]>;
  metrics: SalesMetrics | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePipeline(initialPipelineId?: string): UsePipelineReturn {
  const { user } = useAuthStore();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(initialPipelineId ?? null);
  const [stages, setStages] = useState<DealStage[]>([]);
  const [dealsByStage, setDealsByStage] = useState<Map<string, Deal[]>>(new Map());
  const [metrics, setMetrics] = useState<SalesMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const userId = user?.authUserId ?? user?.id ?? '';

  const fetchPipelines = useCallback(async () => {
    if (!userId) return;
    try {
      const result = await crmAPI.listPipelines(userId);
      if (!mountedRef.current) return;
      setPipelines(result);
      if (!activePipelineId && result.length > 0) {
        const defaultPipeline = result.find(p => p.is_default) ?? result[0];
        setActivePipelineId(defaultPipeline.id);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load pipelines');
    }
  }, [userId, activePipelineId]);

  const fetchPipelineData = useCallback(async () => {
    if (!userId || !activePipelineId) return;
    setLoading(true);
    setError(null);
    try {
      const [pipelineDetail, dealsByStageData, metricsData] = await Promise.all([
        crmAPI.getPipeline(userId, activePipelineId),
        crmAPI.getDealsByStage(userId, activePipelineId),
        crmAPI.getMetrics(userId),
      ]);

      if (!mountedRef.current) return;

      const stagesList = (pipelineDetail.stages ?? []).sort((a, b) => a.position - b.position);

      const dealsMap = new Map<string, Deal[]>();
      for (const stage of stagesList) {
        dealsMap.set(stage.id, dealsByStageData[stage.id] ?? []);
      }

      setStages(stagesList);
      setDealsByStage(dealsMap);
      setMetrics(metricsData);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load pipeline data');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId, activePipelineId]);

  useEffect(() => {
    fetchPipelines();
  }, [fetchPipelines]);

  useEffect(() => {
    if (activePipelineId) fetchPipelineData();
  }, [activePipelineId, fetchPipelineData]);

  const refetch = useCallback(() => {
    fetchPipelineData();
  }, [fetchPipelineData]);

  return {
    pipelines,
    activePipelineId,
    setActivePipelineId,
    stages,
    dealsByStage,
    metrics,
    loading,
    error,
    refetch,
  };
}

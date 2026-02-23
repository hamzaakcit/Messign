import { create } from 'zustand';

export type DashboardMetric = 'revenue' | 'sms' | 'mail';
export type DashboardTimeRange = '7d' | '90d' | '12m' | '3y';

interface DashboardState {
  activeMetric: DashboardMetric;
  activeEntity: 'company' | string;
  activeEntityName: string | null;
  timeRange: DashboardTimeRange;
  setActiveMetric: (metric: DashboardMetric) => void;
  setActiveEntity: (entityId: 'company' | string, name?: string | null) => void;
  setTimeRange: (range: DashboardTimeRange) => void;
  clearEntitySelection: () => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  activeMetric: 'revenue',
  activeEntity: 'company',
  activeEntityName: null,
  timeRange: '12m',
  setActiveMetric: (metric) => set({ activeMetric: metric }),
  setActiveEntity: (entityId, name) =>
    set({
      activeEntity: entityId,
      activeEntityName: name ?? (entityId === 'company' ? null : entityId),
    }),
  setTimeRange: (range) => set({ timeRange: range }),
  clearEntitySelection: () =>
    set({ activeEntity: 'company', activeEntityName: null }),
}));

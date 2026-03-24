import { AnalyticsDashboard } from '@/components/knowledge-hub/analytics/AnalyticsDashboard';

export function KnowledgeAdminDashboard() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-xl font-bold text-app-text mb-6">Knowledge Hub Dashboard</h1>
      <AnalyticsDashboard />
    </div>
  );
}

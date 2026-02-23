import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, Users, Search, AlertCircle, FileText, Eye } from 'lucide-react';
import { khAnalyticsAPI } from '@/lib/knowledge-hub/api';
import type { KhAnalyticsStats, KhContentHealth } from '@/types/knowledge-hub';
import { cn } from '@/lib/utils';

export function AnalyticsDashboard() {
  const [stats, setStats] = useState<KhAnalyticsStats | null>(null);
  const [health, setHealth] = useState<KhContentHealth[]>([]);
  const [topSearches, setTopSearches] = useState<{ query: string; count: number; avg_results: number }[]>([]);
  const [failedSearches, setFailedSearches] = useState<{ query: string; count: number }[]>([]);
  const [contributors, setContributors] = useState<{ author_id: string; name: string; doc_count: number }[]>([]);
  const [viewTrends, setViewTrends] = useState<{ date: string; views: number }[]>([]);

  useEffect(() => {
    khAnalyticsAPI.stats().then(setStats).catch(() => {});
    khAnalyticsAPI.contentHealth().then(setHealth).catch(() => {});
    khAnalyticsAPI.topSearches(30).then(setTopSearches).catch(() => {});
    khAnalyticsAPI.failedSearches(30).then(setFailedSearches).catch(() => {});
    khAnalyticsAPI.topContributors(30).then(setContributors).catch(() => {});
    khAnalyticsAPI.viewTrends(30).then(setViewTrends).catch(() => {});
  }, []);

  const healthColors = { fresh: '#10b981', aging: '#f59e0b', stale: '#ef4444' };
  const totalHealthDocs = health.reduce((sum, h) => sum + h.count, 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total Docs', value: stats.total_docs, icon: FileText, color: 'text-blue-400' },
            { label: 'Published', value: stats.published_docs, icon: FileText, color: 'text-green-400' },
            { label: 'Total Views', value: stats.total_views, icon: Eye, color: 'text-purple-400' },
            { label: 'Searches', value: stats.total_searches, icon: Search, color: 'text-yellow-400' },
            { label: 'Readers', value: stats.total_users, icon: Users, color: 'text-cyan-400' },
          ].map(s => (
            <div key={s.label} className="p-4 rounded-xl bg-dark-800 border border-dark-700">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={cn('w-4 h-4', s.color)} />
                <span className="text-xs text-gray-500">{s.label}</span>
              </div>
              <span className="text-xl font-bold text-white">{s.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Content Health */}
        <div className="p-5 rounded-xl bg-dark-800 border border-dark-700">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><BarChart3 className="w-4 h-4 text-green-400" /> Content Health</h3>
          {totalHealthDocs > 0 ? (
            <>
              <div className="flex rounded-full h-3 overflow-hidden mb-4">
                {health.map(h => (
                  <div key={h.status} style={{ width: `${(h.count / totalHealthDocs) * 100}%`, backgroundColor: healthColors[h.status] }} />
                ))}
              </div>
              <div className="flex gap-4">
                {health.map(h => (
                  <div key={h.status} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: healthColors[h.status] }} />
                    <span className="text-gray-400 capitalize">{h.status}</span>
                    <span className="text-white font-medium">{h.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">No published documents yet</p>
          )}
        </div>

        {/* Top Contributors */}
        <div className="p-5 rounded-xl bg-dark-800 border border-dark-700">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-cyan-400" /> Top Contributors (30d)</h3>
          {contributors.length > 0 ? (
            <div className="space-y-2">
              {contributors.map((c, i) => (
                <div key={c.author_id} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-dark-600 flex items-center justify-center text-xs text-gray-400 font-medium">{i + 1}</span>
                  <span className="flex-1 text-sm text-gray-300 truncate">{c.name}</span>
                  <span className="text-sm font-medium text-white">{c.doc_count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No contributions yet</p>
          )}
        </div>

        {/* Top Searches */}
        <div className="p-5 rounded-xl bg-dark-800 border border-dark-700">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-yellow-400" /> Top Searches (30d)</h3>
          {topSearches.length > 0 ? (
            <div className="space-y-2">
              {topSearches.slice(0, 8).map(s => (
                <div key={s.query} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-gray-300 truncate">"{s.query}"</span>
                  <span className="text-xs text-gray-500">{s.count}x</span>
                  <span className="text-xs text-gray-500">{s.avg_results} results</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No searches yet</p>
          )}
        </div>

        {/* Failed Searches (Knowledge Gaps) */}
        <div className="p-5 rounded-xl bg-dark-800 border border-dark-700">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-400" /> Knowledge Gaps (0-result searches)</h3>
          {failedSearches.length > 0 ? (
            <div className="space-y-2">
              {failedSearches.slice(0, 8).map(s => (
                <div key={s.query} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-gray-300 truncate">"{s.query}"</span>
                  <span className="text-xs text-gray-500">{s.count}x searched</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No failed searches — great coverage!</p>
          )}
        </div>
      </div>

      {/* View Trends */}
      {viewTrends.length > 0 && (
        <div className="p-5 rounded-xl bg-dark-800 border border-dark-700">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><Eye className="w-4 h-4 text-purple-400" /> Reading Activity (30d)</h3>
          <div className="flex items-end gap-1 h-32">
            {viewTrends.map(t => {
              const maxViews = Math.max(...viewTrends.map(v => v.views), 1);
              const height = Math.max((t.views / maxViews) * 100, 4);
              return (
                <div key={t.date} className="flex-1 flex flex-col items-center gap-1" title={`${t.date}: ${t.views} views`}>
                  <div className="w-full rounded-t bg-primary-500/60 hover:bg-primary-500 transition-colors" style={{ height: `${height}%` }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-gray-600">
            <span>{viewTrends[0]?.date}</span>
            <span>{viewTrends[viewTrends.length - 1]?.date}</span>
          </div>
        </div>
      )}
    </div>
  );
}

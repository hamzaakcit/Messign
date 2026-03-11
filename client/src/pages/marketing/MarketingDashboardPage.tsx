import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Mail, Megaphone, Target, TrendingUp } from 'lucide-react';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { KPICard } from '@/components/finance/KPICard';
import { Badge } from '@/components/ui/Badge';
import { useAuthStore } from '@/stores/authStore';
import { marketingAPI, type ContentItem, type DashboardMetrics, type Lead } from '@/lib/marketingApi';
import { MarketingNav } from './components/MarketingNav';

const TOOLTIP_STYLE = {
  background: '#1a1a2e',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#fff',
};
const AXIS_TICK = { fill: '#9ca3af', fontSize: 12 };
const GRID_STROKE = 'rgba(255,255,255,0.05)';
const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#6366f1'];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(value || 0);
}

export function MarketingDashboardPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [hotLeads, setHotLeads] = useState<Lead[]>([]);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [comparison, setComparison] = useState<Array<{ name: string; roi: number }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [metricsRes, hotRes, contentRes, campaignsRes] = await Promise.all([
        marketingAPI.getDashboardMetrics(userId),
        marketingAPI.getHotLeads(userId),
        marketingAPI.listContent(userId, { pageSize: '50' }),
        marketingAPI.listCampaigns(userId, { pageSize: '20' }),
      ]);
      setMetrics(metricsRes);
      setHotLeads(hotRes.slice(0, 5));
      setContent(contentRes.data.sort((a, b) => b.engagement - a.engagement).slice(0, 5));
      setComparison(
        campaignsRes.data
          .map((campaign) => ({ name: campaign.name, roi: campaign.roi ?? 0 }))
          .sort((a, b) => b.roi - a.roi)
          .slice(0, 5),
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sourceData = useMemo(
    () => metrics?.channelBreakdown.map((item) => ({ name: item.channel, value: item.leads, cpl: item.cpl })) ?? [],
    [metrics],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4">
          <MarketingNav />
          <DoraInsightBar module="marketing" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <KPICard title="MQLs This Month" value={metrics?.mqls ?? 0} icon={Target} />
            <KPICard title="Avg CPL" value={formatCurrency(metrics?.cpl ?? 0)} icon={TrendingUp} />
            <KPICard title="Best Campaign ROI" value={`${(metrics?.roi ?? 0).toFixed(2)}x`} icon={BarChart3} />
            <KPICard title="Email Open Rate" value={`${(metrics?.emailOpenRate ?? 0).toFixed(1)}%`} icon={Mail} />
            <KPICard title="Content Published" value={metrics?.contentPublished ?? 0} icon={Megaphone} />
          </div>

          {loading ? (
            <div className="text-sm text-app-muted">Loading marketing dashboard…</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <ChartCard title="Campaign ROI Comparison" icon={BarChart3}>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={comparison} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                      <XAxis type="number" tick={AXIS_TICK} />
                      <YAxis type="category" dataKey="name" tick={AXIS_TICK} width={110} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [`${value.toFixed(2)}x`, 'ROI']} />
                      <Bar dataKey="roi" radius={[0, 4, 4, 0]}>
                        {comparison.map((_, index) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Lead Source Performance" icon={Target}>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={sourceData} dataKey="value" nameKey="name" outerRadius={90}>
                        {sourceData.map((_, index) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(value: number, _name: string, payload: { payload?: { cpl?: number } }) => [
                          `${value} leads${payload.payload?.cpl != null ? ` • CPL €${payload.payload.cpl.toFixed(2)}` : ''}`,
                          'Channel',
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Monthly Trend" icon={TrendingUp}>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={metrics?.monthlyTrend ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                      <XAxis dataKey="month" tick={AXIS_TICK} />
                      <YAxis yAxisId="left" tick={AXIS_TICK} />
                      <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Line yAxisId="left" type="monotone" dataKey="leads" stroke="#3b82f6" strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="spend" stroke="#10b981" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              <div className="space-y-6">
                <ListCard title="Hot Leads">
                  {hotLeads.length === 0 ? (
                    <p className="text-sm text-app-muted">No hot leads yet.</p>
                  ) : (
                    hotLeads.map((lead) => (
                      <div key={lead.id} className="py-2 border-b border-white/5 last:border-0">
                        <p className="text-sm text-app-text font-medium">{[lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email}</p>
                        <div className="flex items-center justify-between text-xs text-app-muted mt-1">
                          <span>{lead.company_name || 'No company'} • {lead.source}</span>
                          <span>{lead.score}/100</span>
                        </div>
                      </div>
                    ))
                  )}
                </ListCard>

                <ListCard title="Top Content">
                  {content.length === 0 ? (
                    <p className="text-sm text-app-muted">No published content yet.</p>
                  ) : (
                    content.map((item) => (
                      <div key={item.id} className="py-2 border-b border-white/5 last:border-0">
                        <p className="text-sm text-app-text font-medium">{item.title}</p>
                        <div className="flex items-center justify-between mt-1">
                          <Badge variant="blue">{item.content_type}</Badge>
                          <span className="text-xs text-app-muted">{item.views} views • {item.leads_attributed} leads</span>
                        </div>
                      </div>
                    ))
                  )}
                </ListCard>

                <ListCard title="Channel Performance">
                  <div className="space-y-3">
                    {metrics?.channelBreakdown.map((item) => (
                      <div key={item.channel} className="grid grid-cols-4 gap-2 text-xs">
                        <span className="text-app-text">{item.channel}</span>
                        <span className="text-app-muted">{formatCurrency(item.spend)}</span>
                        <span className="text-app-muted">{item.leads} leads</span>
                        <span className="text-emerald-300">{item.roi.toFixed(2)}x</span>
                      </div>
                    ))}
                  </div>
                </ListCard>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h3 className="font-semibold text-app-text mb-4 flex items-center gap-2">
        <Icon className="w-4 h-4" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function ListCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h3 className="font-semibold text-app-text mb-3">{title}</h3>
      {children}
    </div>
  );
}

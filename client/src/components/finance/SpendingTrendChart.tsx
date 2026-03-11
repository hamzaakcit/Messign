import React, { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { financeAPI } from '@/lib/financeApi';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const SpendingTrendChart = React.memo(function SpendingTrendChart() {
  const user = useAuthStore((s) => s.user);
  const userId = user?.authUserId || user?.id || '';
  const [data, setData] = useState<Array<{ month: string; total: number }>>([]);

  useEffect(() => {
    if (!userId) return;
    financeAPI
      .getSpendingTrend(userId, 6)
      .then((rows) =>
        setData(
          (rows as Array<{ month: string; total: string }>).map((r) => ({
            month: new Date(r.month).toLocaleDateString('en-US', { month: 'short' }),
            total: parseFloat(r.total),
          })),
        ),
      )
      .catch(console.error);
  }, [userId]);

  if (data.length === 0) {
    return <div className="text-app-muted text-sm text-center py-8">No spending data available</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
        <XAxis dataKey="month" tick={{ fill: '#9ca3af', fontSize: 12 }} />
        <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff' }}
          formatter={(value: number) => [`$${value.toLocaleString()}`, 'Total Spending']}
        />
        <Area type="monotone" dataKey="total" stroke="#6366f1" fillOpacity={1} fill="url(#spendGrad)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
});

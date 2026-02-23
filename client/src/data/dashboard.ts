import type {
  CompanyMetrics,
  RankingStats,
  PerformanceChartDataPoint,
  PersonalOverviewDetail,
  DashboardMetric,
  DashboardInsight,
  QuickStat,
} from '@/types/dashboard';

export const companyMetrics: CompanyMetrics = {
  revenue: {
    value: 12450000,
    changePercent: 8.2,
    period: 'vs last quarter',
  },
  smsAttempts: {
    value: 662,
    changePercent: 12.4,
    unit: 'M',
  },
  mailAttempts: {
    value: 37,
    changePercent: -2.1,
    unit: 'M',
  },
};

export const rankingStats: RankingStats = {
  monthlyPoints: 1840,
  yearlyPoints: 15750,
  totalPoints: 48200,
  currentRank: 12,
  totalEmployees: 148,
  rankChange: 3,
  progressToNextRank: 68,
};

export const performanceChartDaily: PerformanceChartDataPoint[] = [
  { period: 'Mon', revenue: 0.42, smsAttempts: 2.2, mailAttempts: 1.3 },
  { period: 'Tue', revenue: 0.48, smsAttempts: 2.4, mailAttempts: 1.4 },
  { period: 'Wed', revenue: 0.51, smsAttempts: 2.6, mailAttempts: 1.5 },
  { period: 'Thu', revenue: 0.49, smsAttempts: 2.5, mailAttempts: 1.4 },
  { period: 'Fri', revenue: 0.52, smsAttempts: 2.7, mailAttempts: 1.6 },
  { period: 'Sat', revenue: 0.38, smsAttempts: 1.9, mailAttempts: 1.1 },
  { period: 'Sun', revenue: 0.35, smsAttempts: 1.8, mailAttempts: 1.0 },
];

// 90 days: daily data for last 90 days (generated pattern, deterministic)
function generate90DaysData(): PerformanceChartDataPoint[] {
  const data: PerformanceChartDataPoint[] = [];
  const baseRevenue = [0.35, 0.42, 0.48, 0.51, 0.49, 0.52, 0.38];
  const baseSms = [1.8, 2.2, 2.4, 2.6, 2.5, 2.7, 1.9];
  const baseMail = [1.0, 1.3, 1.4, 1.5, 1.4, 1.6, 1.1];
  for (let i = 89; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayIdx = d.getDay();
    const weekFactor = 1 + (89 - i) * 0.0003;
    const jitter = (i % 7) * 0.01;
    data.push({
      period: `${d.getMonth() + 1}/${d.getDate()}`,
      revenue: Math.round((baseRevenue[dayIdx] * weekFactor + jitter) * 100) / 100,
      smsAttempts: Math.round((baseSms[dayIdx] * weekFactor + jitter * 2) * 10) / 10,
      mailAttempts: Math.round((baseMail[dayIdx] * weekFactor + jitter) * 10) / 10,
    });
  }
  return data;
}
export const performanceChart90Days: PerformanceChartDataPoint[] = generate90DaysData();

export const performanceChartMonthly: PerformanceChartDataPoint[] = [
  { period: 'Jan', revenue: 11.2, smsAttempts: 58, mailAttempts: 34 },
  { period: 'Feb', revenue: 11.8, smsAttempts: 61, mailAttempts: 35 },
  { period: 'Mar', revenue: 12.1, smsAttempts: 64, mailAttempts: 36 },
  { period: 'Apr', revenue: 11.9, smsAttempts: 62, mailAttempts: 35 },
  { period: 'May', revenue: 12.4, smsAttempts: 66, mailAttempts: 37 },
  { period: 'Jun', revenue: 12.45, smsAttempts: 66.2, mailAttempts: 37 },
];

// 12 months: extend monthly to full year
export const performanceChart12Months: PerformanceChartDataPoint[] = [
  ...performanceChartMonthly,
  { period: 'Jul', revenue: 12.2, smsAttempts: 65, mailAttempts: 36 },
  { period: 'Aug', revenue: 12.5, smsAttempts: 67, mailAttempts: 37 },
  { period: 'Sep', revenue: 12.8, smsAttempts: 68, mailAttempts: 38 },
  { period: 'Oct', revenue: 13.0, smsAttempts: 69, mailAttempts: 38 },
  { period: 'Nov', revenue: 13.2, smsAttempts: 70, mailAttempts: 39 },
  { period: 'Dec', revenue: 13.45, smsAttempts: 70.5, mailAttempts: 39 },
];

export const personalOverviewDetail: PersonalOverviewDetail = {
  yearlyHoliday: {
    totalDays: 25,
    usedDays: 12,
    remainingDays: 13,
    year: new Date().getFullYear(),
  },
  performance: {
    overallRating: 4.2,
    ratingLabel: 'Exceeds expectations',
    lastReviewDate: '2024-09-15',
    goals: [
      { title: 'Complete certification', progress: 100, status: 'complete' },
      { title: 'Lead 2 cross-team initiatives', progress: 75, status: 'on_track' },
      { title: 'Mentor 1 junior colleague', progress: 40, status: 'on_track' },
    ],
  },
  personalKPIs: [
    { label: 'Tasks completed (MTD)', value: 24, change: 8, unit: '' },
    { label: 'Messages sent', value: 342, change: -2, unit: '' },
    { label: 'Documents created', value: 12, change: 3, unit: '' },
    { label: 'Projects contributed', value: 5, change: 0, unit: '' },
  ],
};

// 3 years: last 12 quarters
export const performanceChart3Years: PerformanceChartDataPoint[] = [
  { period: '2022 Q1', revenue: 32, smsAttempts: 165, mailAttempts: 98 },
  { period: '2022 Q2', revenue: 35, smsAttempts: 178, mailAttempts: 102 },
  { period: '2022 Q3', revenue: 38, smsAttempts: 192, mailAttempts: 108 },
  { period: '2022 Q4', revenue: 41, smsAttempts: 205, mailAttempts: 112 },
  { period: '2023 Q1', revenue: 44, smsAttempts: 218, mailAttempts: 115 },
  { period: '2023 Q2', revenue: 48, smsAttempts: 235, mailAttempts: 120 },
  { period: '2023 Q3', revenue: 51, smsAttempts: 248, mailAttempts: 125 },
  { period: '2023 Q4', revenue: 54, smsAttempts: 262, mailAttempts: 130 },
  { period: '2024 Q1', revenue: 58, smsAttempts: 278, mailAttempts: 132 },
  { period: '2024 Q2', revenue: 62, smsAttempts: 295, mailAttempts: 135 },
  { period: '2024 Q3', revenue: 65, smsAttempts: 308, mailAttempts: 140 },
  { period: '2024 Q4', revenue: 68, smsAttempts: 320, mailAttempts: 142 },
];

// Premium dashboard: metrics with sparklines (last 7 periods from monthly)
export const dashboardMetrics: DashboardMetric[] = [
  {
    id: 'revenue',
    name: 'Revenue',
    value: 12.45,
    change: 8.2,
    changeType: 'positive',
    icon: 'DollarSign',
    color: '#3b82f6',
    sparklineData: [11.2, 11.8, 12.1, 11.9, 12.4, 12.45, 12.45],
    target: 15,
    unit: 'M',
    comparisonValue: 11.43,
    comparisonPeriod: 'vs Last Quarter',
    format: (n) => `$${n.toFixed(2)}M`,
  },
  {
    id: 'sms',
    name: 'SMS Attempts',
    value: 662,
    change: 12.4,
    changeType: 'positive',
    icon: 'MessageSquare',
    color: '#a855f7',
    sparklineData: [58, 61, 64, 62, 66, 66.2, 66.2],
    unit: 'M',
    comparisonValue: 590,
    comparisonPeriod: 'vs Last Quarter',
    format: (n) => `${Math.round(n)}M`,
  },
  {
    id: 'mail',
    name: 'Mail Attempts',
    value: 37,
    change: -2.1,
    changeType: 'negative',
    icon: 'Mail',
    color: '#22c55e',
    sparklineData: [34, 35, 36, 35, 37, 37, 37],
    unit: 'M',
    comparisonValue: 37.8,
    comparisonPeriod: 'vs Last Quarter',
    format: (n) => `${Math.round(n)}M`,
  },
];

export const dashboardInsights: DashboardInsight[] = [
  {
    id: 'trend-1',
    type: 'trend',
    title: 'Strong Growth',
    description:
      'Revenue up 8.2% from last quarter, outpacing the industry average of 5.1%. Main driver: SMS campaigns.',
    severity: 'success',
  },
  {
    id: 'alert-1',
    type: 'alert',
    title: 'Attention Needed',
    description:
      'Mail attempts down 2.1%. Consider reviewing email deliverability settings.',
    severity: 'warning',
    action: { label: 'Review Settings →' },
  },
  {
    id: 'forecast-1',
    type: 'forecast',
    title: 'Forecast',
    description:
      'Based on current trend, expect $13.2M revenue next month (±$0.5M). Confidence: 87%.',
    severity: 'info',
    action: { label: 'View Model →' },
  },
];

export const dashboardQuickStats: QuickStat[] = [
  { label: 'Peak Day', value: 'May 15' },
  { label: 'Best Metric', value: 'SMS +15.2%' },
  { label: 'Avg Growth', value: '+6.8%/month' },
  { label: 'Volatility', value: 'Low (2.1σ)' },
];

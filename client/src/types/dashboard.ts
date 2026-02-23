/** Dashboard-specific types for main executive view */

export interface CompanyMetrics {
  revenue: {
    value: number;
    changePercent: number;
    period: string;
  };
  smsAttempts: {
    value: number;
    changePercent: number;
    unit: 'M' | 'K';
  };
  mailAttempts: {
    value: number;
    changePercent: number;
    unit: 'M' | 'K';
  };
}

/** Premium dashboard: metric with sparkline and comparison */
export interface DashboardMetric {
  id: string;
  name: string;
  value: number;
  change: number;
  changeType: 'positive' | 'negative' | 'neutral';
  icon: string; // Lucide icon name for mapping
  color: string;
  sparklineData: number[];
  target?: number;
  unit?: string;
  comparisonValue?: number;
  comparisonPeriod?: string;
  format: (n: number) => string;
}

/** Chart data point (period + series) */
export interface ChartDataPoint {
  period: string;
  date?: string;
  revenue?: number;
  smsAttempts?: number;
  mailAttempts?: number;
  [key: string]: string | number | undefined;
}

/** Insight card for Key Insights panel */
export interface DashboardInsight {
  id: string;
  type: 'trend' | 'alert' | 'forecast' | 'anomaly';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'success' | 'error';
  action?: {
    label: string;
    href?: string;
  };
}

/** Quick stat for insights panel */
export interface QuickStat {
  label: string;
  value: string;
}

export interface RankingStats {
  monthlyPoints: number;
  yearlyPoints: number;
  totalPoints: number;
  currentRank: number;
  totalEmployees: number;
  rankChange: number; // e.g. +3 or -2
  progressToNextRank: number; // 0-100
}

export interface PerformanceChartDataPoint {
  period: string;
  revenue?: number;
  smsAttempts?: number;
  mailAttempts?: number;
}

export type ChartTimeRange = 'daily' | '90days' | '12months' | '3years';

/** Currently selected metric for company performance chart */
export type ActiveMetric = 'revenue' | 'sms' | 'mail';

/** Personal overview detail (slide-out panel) */
export interface PersonalOverviewDetail {
  yearlyHoliday: {
    totalDays: number;
    usedDays: number;
    remainingDays: number;
    year: number;
  };
  performance: {
    overallRating: number; // 1–5 or 0–100
    ratingLabel: string;
    lastReviewDate: string;
    goals: { title: string; progress: number; status: 'on_track' | 'at_risk' | 'complete' }[];
  };
  personalKPIs: {
    label: string;
    value: string | number;
    change?: number;
    unit?: string;
  }[];
}

/** Performance API response types (dashboard read) */

export type TrendPeriod = '7d' | '90d' | '12m' | '3y';

export interface CompanyPerformanceResponse {
  success: boolean;
  data: {
    revenue: {
      value: number;
      formatted: string;
      previousPeriod: number;
      changePercent: number;
      changeDirection: 'up' | 'down' | 'neutral';
      sparklineData: number[];
    };
    smsAttempts: {
      value: number;
      formatted: string;
      previousPeriod: number;
      changePercent: number;
      changeDirection: 'up' | 'down' | 'neutral';
      deliveryRate?: number;
      sparklineData: number[];
    };
    mailAttempts: {
      value: number;
      formatted: string;
      previousPeriod: number;
      changePercent: number;
      changeDirection: 'up' | 'down' | 'neutral';
      deliveryRate?: number;
      sparklineData: number[];
    };
    lastUpdated: string;
  };
}

export interface CompanyTrendsResponse {
  success: boolean;
  data: Array<{
    period: string;
    revenue?: number;
    smsAttempts?: number;
    mailAttempts?: number;
  }>;
}

export type PerformanceStatus = 'exceeding' | 'on_target' | 'needs_attention' | 'below_target';

export interface TeamMemberEnterprise {
  id: string;
  rank: number;
  name: string;
  avatar: string;
  role: string;
  joinDate?: string;
  metrics: {
    revenue: {
      value: number;
      formatted: string;
      target: number;
      targetPercent: number;
      previousPeriod?: number;
      trend: { direction: 'up' | 'down'; percent: number };
    };
    smsAttempts: { value: number; formatted: string; deliveryRate: number };
    mailAttempts: { value: number; formatted: string; deliveryRate: number };
    conversionRate: number;
  };
  status: PerformanceStatus;
  statusLabel: string;
}

export interface TeamMemberWholesale {
  id: string;
  rank: number;
  name: string;
  avatar: string;
  role: string;
  metrics: {
    revenue: {
      value: number;
      formatted: string;
      target: number;
      targetPercent: number;
      trend: { direction: 'up' | 'down'; percent: number };
    };
    smsVolume: {
      value: number;
      formatted: string;
      deliveryRate: number;
      responseRate: number;
      costPerSMS: number;
    };
  };
  status: PerformanceStatus;
  statusLabel: string;
}

export interface TeamPerformanceResponse<T = TeamMemberEnterprise[] | TeamMemberWholesale[]> {
  success: boolean;
  data: {
    teamId: string;
    teamName: string;
    summary: Record<string, { value: number; formatted: string; changePercent?: number; change?: number }>;
    members: T;
    lastUpdated: string;
  };
}

export interface TeamTrendsResponse {
  success: boolean;
  data: Array<{
    period: string;
    name?: string;
    revenue?: number;
    smsVolume?: number;
    deliveryRate?: number;
  }>;
}

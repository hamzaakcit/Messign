// Barrel re-export — keeps all existing `from '../lib/marketingApi'` imports working.

export type { PaginatedResult } from './types';
export type {
  MarketingApprovalApiRow,
  SpendEntry,
  Campaign,
  EmailTemplate,
  ContentItem,
  ContentCalendarDay,
  Lead,
  EmailCampaign,
  LandingPage,
  MarketingPopup,
  MarketingDocument,
  BatchJob,
  BatchChannelResult,
  BatchError,
  PerformanceRecord,
  PerformanceContext,
  CalibrationPromptResponse,
  BrandProfileClient,
  BrandProfileStats,
  RecordMetricsPayload,
  MarketingAutomation,
  CampaignMetricsSummary,
  LeadFunnelMetrics,
  DashboardMetrics,
  SubmitApprovalReviewPayload,
  ComplianceFlag,
  BrandComplianceScanResult,
  CompetitorClient,
  CompetitorEventClient,
  CompetitorScrapeStatus,
  CompetitorStatsResponse,
  CompetitorLastScrapeSummary,
  CeoDashboardSnapshot,
  CeoDashboardTrend,
  MpTriggerClient,
  MpTriggerSummaryUser,
  CommandCenterPayload,
  CommandCenterDailyPoint,
  CommandCenterStrategyPlay,
  CommandCenterExperimentRow,
} from './types';

export { BATCH_TERMINAL_STATES } from './helpers';

import { campaignMethods } from './campaignMethods';
import { contentMethods } from './contentMethods';
import { channelMethods } from './channelMethods';
import { workflowMethods } from './workflowMethods';

export const marketingAPI = {
  ...campaignMethods,
  ...contentMethods,
  ...channelMethods,
  ...workflowMethods,
};

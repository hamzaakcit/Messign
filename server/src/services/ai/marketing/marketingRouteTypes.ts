/**
 * Shared types for marketing sub-orchestrator routing (V1/V2).
 */

export type MarketingRouteKind =
  | 'CONTENT_STRATEGIST'
  | 'CAMPAIGN_MANAGER'
  | 'BOTH_CAMPAIGN_THEN_CONTENT'
  | 'CLARIFY'
  | 'NOT_MARKETING';

export interface ParsedMarketingRoute {
  route: MarketingRouteKind;
  clarifyQuestion?: string;
  notMarketingMessage?: string;
  campaignContextNote?: string;
}

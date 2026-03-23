/**
 * Competitor Intelligence — Moat feature scaffold (March 2026 roadmap)
 *
 * Intended loop: scrape competitor surfaces → diff vs our positioning → propose counter-campaign.
 * No live scraping here; safe types + stub entry for future tool wiring.
 */

export type CompetitorIntelPhase = 'scrape' | 'diff' | 'counter_campaign';

export interface CompetitorIntelBrief {
  /** Competitor site or asset URL when known */
  competitorUrl?: string;
  /** Topic / category for diff */
  topic?: string;
  organizationId?: string;
}

export interface CompetitorIntelScaffoldResult {
  phase: CompetitorIntelPhase;
  status: 'scaffold';
  message: string;
}

/**
 * Placeholder: returns a structured stub. Wire to `marketing:competitor_content_scan`
 * and approved crawlers when policy allows.
 */
export async function runCompetitorIntelScaffold(
  brief: CompetitorIntelBrief,
): Promise<CompetitorIntelScaffoldResult> {
  return {
    phase: 'scrape',
    status: 'scaffold',
    message: `Competitor intelligence loop not executed (scaffold). topic=${brief.topic ?? 'n/a'} url=${brief.competitorUrl ?? 'n/a'}`,
  };
}

/**
 * Competitor Scraper
 *
 * Fetches competitor web pages, extracts content, uses LLM to classify
 * events, and stores them via the Event Store. Lightweight: uses node
 * fetch + regex HTML parsing — no Playwright dependency for MVP.
 */

import type { DbClient } from './performanceCollector.js';
import type { Competitor, CreateEventInput, EventType, SignificanceLevel } from './competitorService.js';
import { recordEvent, markScraped, getCompetitor, listCompetitors, queryEvents, updateEventAnalysis } from './competitorService.js';
import { buildEventAnalysisPrompt } from './competitorAnalysisPrompts.js';

// ── Types ──

export interface ScrapeResult {
  competitorId: string;
  competitorName: string;
  urlsScraped: number;
  urlsFailed: number;
  eventsFound: number;
  eventsNew: number;
  eventsDuplicate: number;
  errors: Array<{ url: string; error: string }>;
  durationMs: number;
}

export interface ExtractedItem {
  title: string;
  url: string;
  date?: string;
  snippet?: string;
  fullText?: string;
}

export interface ClassifiedEvent {
  eventType: EventType;
  title: string;
  summary: string;
  tags: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  significance: SignificanceLevel;
}

export type ScraperLLMCall = (params: {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}) => Promise<string>;

// ── Main Scraper ──

export async function scrapeCompetitor(
  competitorId: string,
  callLLM: ScraperLLMCall,
  db: DbClient,
): Promise<ScrapeResult> {
  const startTime = Date.now();

  const competitor = await getCompetitor(competitorId, db);
  if (!competitor) throw new Error(`Competitor ${competitorId} not found`);
  if (!competitor.active) throw new Error(`Competitor ${competitor.name} is inactive`);

  const result: ScrapeResult = {
    competitorId: competitor.id,
    competitorName: competitor.name,
    urlsScraped: 0,
    urlsFailed: 0,
    eventsFound: 0,
    eventsNew: 0,
    eventsDuplicate: 0,
    errors: [],
    durationMs: 0,
  };

  for (const url of competitor.monitor_urls) {
    try {
      const html = await fetchPage(url);
      result.urlsScraped++;

      const items = extractContentItems(html, url);
      result.eventsFound += items.length;

      const itemsToProcess = items.slice(0, 10);

      for (const item of itemsToProcess) {
        try {
          const classified = await classifyItem(item, competitor, callLLM);

          const stored = await recordEvent({
            organizationId: competitor.organization_id,
            competitorId: competitor.id,
            eventType: classified.eventType,
            title: classified.title,
            summary: classified.summary,
            bodyText: item.fullText?.slice(0, 5000) || item.snippet,
            sourceUrl: item.url,
            tags: classified.tags,
            sentiment: classified.sentiment,
            significance: classified.significance,
            eventDate: item.date || undefined,
          }, db);

          if (stored.isNew) result.eventsNew++;
          else result.eventsDuplicate++;
        } catch (itemError) {
          console.warn(`[Scraper] Failed to process item "${item.title}":`, itemError);
        }
      }
    } catch (urlError) {
      result.urlsFailed++;
      result.errors.push({
        url,
        error: urlError instanceof Error ? urlError.message : String(urlError),
      });
    }
  }

  await markScraped(competitor.id, db);

  await enrichHighSignificanceEvents(competitor, callLLM, db);

  result.durationMs = Date.now() - startTime;
  return result;
}

export async function scrapeAllCompetitors(
  organizationId: string,
  callLLM: ScraperLLMCall,
  db: DbClient,
): Promise<ScrapeResult[]> {
  const { competitors } = await listCompetitors(
    organizationId,
    { includeInactive: false, limit: 100 },
    db,
  );

  const results: ScrapeResult[] = [];
  for (const competitor of competitors) {
    if (competitor.monitor_urls.length === 0) continue;
    try {
      const result = await scrapeCompetitor(competitor.id, callLLM, db);
      results.push(result);
    } catch (error) {
      console.error(`[Scraper] Failed to scrape ${competitor.name}:`, error);
      results.push({
        competitorId: competitor.id,
        competitorName: competitor.name,
        urlsScraped: 0,
        urlsFailed: competitor.monitor_urls.length,
        eventsFound: 0,
        eventsNew: 0,
        eventsDuplicate: 0,
        errors: [{ url: '*', error: error instanceof Error ? error.message : String(error) }],
        durationMs: 0,
      });
    }
  }

  return results;
}

// ── Post-Scrape Enrichment ──

async function enrichHighSignificanceEvents(
  competitor: Competitor,
  callLLM: ScraperLLMCall,
  db: DbClient,
): Promise<void> {
  try {
    const { events: highEvents } = await queryEvents(competitor.organization_id, {
      competitorId: competitor.id,
      significance: 'high',
      limit: 5,
    }, db);
    const { events: criticalEvents } = await queryEvents(competitor.organization_id, {
      competitorId: competitor.id,
      significance: 'critical',
      limit: 5,
    }, db);

    const unenriched = [...criticalEvents, ...highEvents]
      .filter((e) => !e.ai_analysis)
      .slice(0, 3);

    for (const event of unenriched) {
      try {
        const prompt = buildEventAnalysisPrompt(event, competitor);
        const analysis = await callLLM({
          systemPrompt: prompt.systemPrompt,
          userPrompt: prompt.userPrompt,
          maxTokens: 300,
        });
        if (analysis) {
          await updateEventAnalysis(event.id, analysis, db);
        }
      } catch (err) {
        console.warn(`[Scraper] Event enrichment failed for "${event.title}":`, err);
      }
    }
  } catch (err) {
    console.warn('[Scraper] Event enrichment query failed:', err);
  }
}

// ── Page Fetching ──

export async function fetchPage(url: string, timeoutMs: number = 15000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MessignBot/1.0 (Competitive Intelligence; +https://messign.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml') && !contentType.includes('application/xml') && !contentType.includes('text/xml')) {
      throw new Error(`Unexpected content type: ${contentType}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

// ── Content Extraction ──

export function extractContentItems(html: string, pageUrl: string): ExtractedItem[] {
  const items: ExtractedItem[] = [];

  const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/gi;
  let match;
  while ((match = articleRegex.exec(html)) !== null) {
    const item = parseArticleBlock(match[1], pageUrl);
    if (item) items.push(item);
  }

  if (items.length === 0) {
    const headingLinkRegex = /<h[1-3][^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/h[1-3]>/gi;
    while ((match = headingLinkRegex.exec(html)) !== null) {
      const href = resolveUrl(match[1], pageUrl);
      const title = stripHtml(match[2]).trim();
      if (title && title.length >= 5) {
        items.push({ title, url: href });
      }
    }
  }

  if (items.length === 0) {
    const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>|<item[^>]*>([\s\S]*?)<\/item>/gi;
    while ((match = entryRegex.exec(html)) !== null) {
      const entry = match[1] || match[2];
      const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const linkMatch = entry.match(/<link[^>]*href="([^"]*)"/) || entry.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      if (titleMatch) {
        items.push({
          title: stripHtml(titleMatch[1]).trim(),
          url: linkMatch ? resolveUrl(linkMatch[1] || linkMatch[2], pageUrl) : pageUrl,
        });
      }
    }
  }

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseArticleBlock(html: string, baseUrl: string): ExtractedItem | null {
  const titleMatch = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (!titleMatch) return null;

  const title = stripHtml(titleMatch[1]).trim();
  if (!title || title.length < 5) return null;

  const linkMatch = html.match(/<a[^>]*href="([^"]*)"[^>]*>/i);
  const url = linkMatch ? resolveUrl(linkMatch[1], baseUrl) : baseUrl;

  const dateMatch = html.match(/<time[^>]*datetime="([^"]*)"/) ||
    html.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : undefined;

  const pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const snippet = pMatch ? stripHtml(pMatch[1]).trim().slice(0, 200) : undefined;

  return { title, url, date, snippet };
}

// ── LLM Classification ──

export async function classifyItem(
  item: ExtractedItem,
  competitor: Competitor,
  callLLM: ScraperLLMCall,
): Promise<ClassifiedEvent> {
  const systemPrompt = `You are a competitive intelligence analyst. Classify this content from a competitor.

Competitor: ${competitor.name} (${competitor.industry || 'technology'})
Website: ${competitor.website_url || 'unknown'}

Classify into one of these event types:
- blog_post: Regular blog content, thought leadership
- product_launch: New product or major new offering
- pricing_change: Pricing updates, plan changes
- email_campaign: Marketing email content
- press_release: Official press/media releases
- feature_update: Feature releases, updates, improvements
- partnership: Strategic partnerships, integrations
- funding: Fundraising, investment announcements
- social_post: Social media content
- other: Doesn't fit above categories

Significance levels:
- critical: Major product launch, funding round, acquisition
- high: Significant feature, pricing change, major partnership
- normal: Regular blog post, routine update
- low: Minor social post, routine content

Output ONLY valid JSON (no markdown, no explanation):
{"event_type": "...", "title": "...", "summary": "...", "tags": ["...", "..."], "sentiment": "positive|negative|neutral", "significance": "low|normal|high|critical"}

Keep summary under 200 chars. Tags: 2-5 lowercase keywords.`;

  const userPrompt = `Classify this content:
Title: ${item.title}
URL: ${item.url}
${item.snippet ? `Excerpt: ${item.snippet}` : ''}
${item.date ? `Date: ${item.date}` : ''}`;

  const response = await callLLM({ systemPrompt, userPrompt, maxTokens: 250 });
  return parseClassificationResponse(response, item.title);
}

export function parseClassificationResponse(
  response: string,
  fallbackTitle: string,
): ClassifiedEvent {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');

    const cleaned = jsonMatch[0]
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/'/g, '"');

    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const validTypes: EventType[] = [
      'blog_post', 'product_launch', 'pricing_change',
      'email_campaign', 'social_post', 'press_release',
      'feature_update', 'partnership', 'funding', 'other',
    ];
    const validSignificance: SignificanceLevel[] = ['low', 'normal', 'high', 'critical'];
    const validSentiment = ['positive', 'negative', 'neutral'] as const;

    return {
      eventType: validTypes.includes(parsed.event_type as EventType) ? (parsed.event_type as EventType) : 'other',
      title: (typeof parsed.title === 'string' && parsed.title.length > 0)
        ? parsed.title.slice(0, 200)
        : fallbackTitle,
      summary: (typeof parsed.summary === 'string')
        ? parsed.summary.slice(0, 500)
        : '',
      tags: Array.isArray(parsed.tags)
        ? (parsed.tags as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 5)
        : [],
      sentiment: validSentiment.includes(parsed.sentiment as typeof validSentiment[number])
        ? (parsed.sentiment as 'positive' | 'negative' | 'neutral')
        : 'neutral',
      significance: validSignificance.includes(parsed.significance as SignificanceLevel)
        ? (parsed.significance as SignificanceLevel)
        : 'normal',
    };
  } catch {
    return {
      eventType: 'other',
      title: fallbackTitle,
      summary: '',
      tags: [],
      sentiment: 'neutral',
      significance: 'normal',
    };
  }
}

// ── pg-boss Job Integration ──

interface ScrapeJobPayload {
  organizationId?: string;
  competitorId?: string;
}

export async function registerScrapeJobHandler(
  callLLM: ScraperLLMCall,
  db: DbClient,
): Promise<string> {
  const { registerJobHandler, JOB_NAMES } = await import('../jobQueue.js');

  return registerJobHandler<ScrapeJobPayload>(
    JOB_NAMES.COMPETITOR_SCRAPE,
    async (jobs) => {
      const job = jobs[0];
      const { organizationId, competitorId } = job.data;

      if (competitorId) {
        console.info(`[Scraper] Scraping competitor ${competitorId}`);
        const result = await scrapeCompetitor(competitorId, callLLM, db);
        console.info(`[Scraper] Completed: ${result.eventsNew} new, ${result.eventsDuplicate} duplicates`);
      } else if (organizationId) {
        console.info(`[Scraper] Scraping all competitors for org ${organizationId}`);
        const results = await scrapeAllCompetitors(organizationId, callLLM, db);
        const totalNew = results.reduce((sum, r) => sum + r.eventsNew, 0);
        console.info(`[Scraper] Completed: ${results.length} competitors, ${totalNew} total new events`);
      } else {
        console.warn('[Scraper] Job missing both organizationId and competitorId');
      }
    },
  );
}

export async function scheduleRecurringScrape(
  organizationId: string,
  intervalHours: number = 6,
): Promise<string | null> {
  const { enqueueJob, JOB_NAMES } = await import('../jobQueue.js');
  return enqueueJob(
    JOB_NAMES.COMPETITOR_SCRAPE,
    { organizationId },
    {
      singletonKey: `scrape-${organizationId}`,
      singletonSeconds: intervalHours * 3600,
      retryLimit: 1,
      expireInSeconds: 3600,
    },
  );
}

export async function triggerScrape(
  competitorId: string,
  organizationId: string,
): Promise<string | null> {
  const { enqueueJob, JOB_NAMES } = await import('../jobQueue.js');
  return enqueueJob(
    JOB_NAMES.COMPETITOR_SCRAPE,
    { competitorId, organizationId },
    { retryLimit: 1 },
  );
}

// ── HTML Helpers ──

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

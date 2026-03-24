-- Migration 102: Persist last competitor scrape run summary for UI (errors, counts).

ALTER TABLE competitors
  ADD COLUMN IF NOT EXISTS last_scrape_summary JSONB;

COMMENT ON COLUMN competitors.last_scrape_summary IS
  'Latest scrape result: urlsScraped, urlsFailed, eventsNew, errors[], finishedAt, durationMs, etc.';

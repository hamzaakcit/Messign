# Competitor Intelligence — Manual E2E Test Checklist
# Date tested: ___________

## Setup
- [ ] Dev server running with pg-boss + LLM gateway
- [ ] At least 1 competitor created with monitor URLs pointing to a real blog

## Test 1: Competitor CRUD
- [ ] Open Competitor Manager
- [ ] Create competitor: name, website, tier, monitor URLs
- [ ] Edit: change tier, add/remove URLs
- [ ] Delete: soft-delete, disappears from active list

## Test 2: Manual Scrape
- [ ] Click "Scrape Now" on a competitor
- [ ] Job queued message appears
- [ ] After ~10-30 seconds: events appear in dashboard
- [ ] Last scraped timestamp updates

## Test 3: Scrape All
- [ ] Click "Scrape All Now"
- [ ] All active competitors get scraped
- [ ] Events populate the timeline

## Test 4: Event Timeline
- [ ] Dashboard shows events in reverse chronological order
- [ ] Event cards show: type badge, title, summary, tags, date
- [ ] Source link opens in new tab
- [ ] High/critical events show significance dot

## Test 5: Filters
- [ ] Time range filter: switch between Week/Month/Quarter/Year
- [ ] Event type filter: filter to only Product Launches
- [ ] Competitor filter: click a competitor card to filter
- [ ] "All Competitors" resets the filter
- [ ] Filters combine correctly (e.g., Acme + product_launch + last_week)

## Test 6: AI Analysis
- [ ] High-significance events show AI analysis section
- [ ] Click to expand → shows LLM-generated analysis
- [ ] Analysis includes "What happened", "Why it matters"

## Test 7: Dora Integration
- [ ] Open Dora / Command Center
- [ ] Ask: "What has [competitor name] done this month?"
- [ ] Dora invokes competitor_intelligence tool
- [ ] Returns structured summary of events
- [ ] Ask: "Give me the competitive landscape"
- [ ] Returns strategic briefing with threats/opportunities

## Test 8: Deduplication
- [ ] Scrape the same competitor twice
- [ ] Second scrape should not create duplicate events
- [ ] Event count stays the same

## Test 9: Empty State
- [ ] New workspace with no competitors → "Add your first competitor"
- [ ] Competitor with no events → "No events found. Run a scrape."

## Test 10: Navigation
- [ ] Competitor Intelligence accessible from marketing nav (Radar icon)
- [ ] Page loads without errors
- [ ] All tabs/filters work
- [ ] Manager slide-over opens and closes cleanly

## Results: ___ / 10 passed

# Performance Feedback Loop — Manual E2E Test Checklist
# Date tested: ___________

## Setup
- [ ] Dev server running, database migrated (performance_feedback table exists)
- [ ] At least 1 email campaign exists in the marketing module
- [ ] Calibration cache is empty (fresh server start)

## Test 1: Record Metrics Manually
- [ ] Open an email campaign detail view
- [ ] Find the "Campaign Metrics" section
- [ ] Enter: Open Rate 32%, CTR 5.2%, Conversion 2%, Send Count 5000
- [ ] Click "Record Metrics"
- [ ] Success toast appears
- [ ] Metrics appear in the history table below

## Test 2: Metrics History
- [ ] Record metrics for the same content 2-3 times with different values
- [ ] History table shows all recordings, most recent first
- [ ] Each row shows: date, open rate, CTR, conversion, send count

## Test 3: Calibration Context API
- [ ] Call GET /api/marketing/performance/context in browser/Postman
- [ ] Response shows top/bottom performers (if enough data)
- [ ] Averages calculated correctly
- [ ] Patterns extracted (themes, tones, subject lengths)

## Test 4: Calibration Prompt Preview
- [ ] In the metrics section, expand "View calibration data"
- [ ] Shows the generated calibration prompt text
- [ ] Shows "Based on N campaigns"
- [ ] If insufficient data: shows "No historical data" fallback

## Test 5: Calibration in LLM Output
- [ ] Record metrics for 10+ content pieces (or seed the DB)
- [ ] Ask Dora to write an email
- [ ] Check server logs for calibration injection
  (or call GET /performance/context/prompt to see what the LLM received)
- [ ] The generated email should reflect calibration patterns
  (e.g., if top performers use "startup" theme, the LLM should lean toward it)

## Test 6: Cache Behavior
- [ ] Call GET /performance/context/prompt twice quickly
- [ ] Second call should be faster (cached)
- [ ] Record new metrics
- [ ] Call again — should return updated data (cache invalidated)
- [ ] Check GET /performance/cache-stats for cache entries

## Test 7: Skip Calibration
- [ ] If supported in UI: create content with skip_calibration flag
- [ ] The LLM prompt should NOT include calibration section
- [ ] Generated content uses default patterns, not workspace-specific

## Test 8: Webhook (if ESP integration available)
- [ ] Send a test webhook payload to POST /api/marketing/performance/webhook
- [ ] Use a SendGrid-format payload
- [ ] Check that metrics are recorded in performance_feedback table
- [ ] If no ESP available: skip and note "webhook tested via API only"

## Results: ___ / 8 passed

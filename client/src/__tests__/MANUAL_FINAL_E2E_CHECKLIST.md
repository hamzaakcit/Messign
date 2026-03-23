# Messign Marketing Module — FINAL E2E Checklist
# The Grand Finale: 6-Month Verification
# Date tested: ___________

## Setup
- [ ] Dev server running with all services (pg-boss, LLM gateway)
- [ ] Database migrated through migration 101
- [ ] At least 1 workspace with content, brand profiles, and competitors

## MONTH 1: Visual Architect v2

- [ ] Ask Dora to write an email → VA2 manifest generated
- [ ] Click "Apply AI Draft" → Unlayer loads assembled design
- [ ] Theme switcher: change theme → email re-assembles
- [ ] Export HTML → valid email

## MONTH 2: Automated Batching

- [ ] Open content → "Atomize to Channels"
- [ ] Select all 5 channels → Atomize
- [ ] All channels complete → derivatives linked to parent
- [ ] Email derivative → opens in VA2 pipeline

## MONTH 3: Performance Feedback Loop

- [ ] Record metrics for a content piece (open rate, CTR)
- [ ] Check calibration prompt: GET /api/marketing/performance/context/prompt
- [ ] Ask Dora to write a new email → calibration data included in prompt
- [ ] Verify email reflects workspace patterns (if enough data)

## MONTH 4: Brand Compliance

- [ ] Create brand profile with forbidden words
- [ ] Create content with a forbidden word
- [ ] Submit for review → auto-scan triggers
- [ ] ComplianceBadge shows in approval queue
- [ ] ComplianceDetailPanel shows flags
- [ ] Fix content → rescan → score improves

## MONTH 5: Competitor Intelligence

- [ ] Add a competitor with monitor URLs
- [ ] Trigger scrape → events appear in timeline
- [ ] Ask Dora: "What has [competitor] done recently?"
- [ ] Dora returns structured competitive intelligence
- [ ] Dashboard shows events + filters work

## MONTH 6: CEO Dashboard + MP

- [ ] Open CEO Dashboard
- [ ] All 5 metric categories populated
- [ ] Trend charts render with Recharts
- [ ] Content pipeline funnel shows status distribution
- [ ] Channel success rates displayed
- [ ] Compliance overview with violations
- [ ] Competitor landscape summary
- [ ] "Refresh" button regenerates snapshot
- [ ] MP triggers fire when metrics exceed thresholds
- [ ] Leaderboard shows point rankings

## CROSS-MODULE INTEGRATION

- [ ] Email (M1) → Atomize (M2) → Metrics (M3) → Dashboard (M6)
  Full lifecycle: create email, atomize, record metrics, see in dashboard

- [ ] Brand (M4) → Content + Compliance scan → Dashboard compliance rate

- [ ] Competitor scrape (M5) → Dashboard competitor events count

- [ ] High performance metrics (M3) → MP trigger fires (M6)

- [ ] Perfect compliance score → MP trigger fires

## RESULTS

Month 1 tests: ___ / 4
Month 2 tests: ___ / 4
Month 3 tests: ___ / 4
Month 4 tests: ___ / 6
Month 5 tests: ___ / 5
Month 6 tests: ___ / 10
Cross-module: ___ / 5

TOTAL: ___ / 38

## 6-MONTH ROADMAP: COMPLETE

# Brand Compliance — Manual E2E Test Checklist
# Date tested: ___________

## Setup
- [ ] Dev server running with LLM gateway configured
- [ ] At least 1 brand profile created (with forbidden words + disclaimers)
- [ ] At least 1 content piece associated with the brand profile

## Test 1: Brand Profile CRUD
- [ ] Create a new brand profile via BrandProfileManager
- [ ] Set tone keywords, forbidden words, disclaimers, preferred themes
- [ ] Save — profile appears in list
- [ ] Edit — change a field, save, verify update
- [ ] Soft-delete — profile disappears from active list

## Test 2: Brand Selection in Content Creation
- [ ] Create new content
- [ ] BrandSelector shows available brands + "No specific brand"
- [ ] Select a brand → create content
- [ ] Verify content.brand_profile_id is set in the database

## Test 3: Auto-Scan on Submit for Review
- [ ] Create content with a brand profile that has forbidden words
- [ ] Include some forbidden words in the content body
- [ ] Submit content for review (status → in_review)
- [ ] Compliance scan runs automatically (check server logs)
- [ ] ComplianceBadge appears in approval queue

## Test 4: Compliance Badge in Approval Queue
- [ ] Open approval queue
- [ ] Content with compliance scan shows colored badge
- [ ] Green for passing, amber for warning, red for failing
- [ ] Hover shows flag count tooltip

## Test 5: Compliance Detail Panel
- [ ] Open content detail for a scanned piece
- [ ] ComplianceDetailPanel shows score breakdown
- [ ] Rule score + LLM score displayed with weights
- [ ] Flags listed by severity (errors first)
- [ ] "Rescan" button triggers new scan

## Test 6: Forbidden Word Detection
- [ ] Create content with known forbidden words
- [ ] Trigger scan → forbidden words flagged with locations
- [ ] Fix the forbidden words → rescan → flags disappear, score improves

## Test 7: Missing Disclaimer Detection
- [ ] Brand profile has required disclaimers
- [ ] Content without disclaimers → flagged
- [ ] Add disclaimers → rescan → flags clear

## Test 8: LLM Tone Check
- [ ] Create content that's on-brand → high LLM score
- [ ] Create content that's very off-brand (wrong tone) → lower LLM score
- [ ] LLM issues shown with suggestions

## Test 9: Brand Filter on Content List
- [ ] Open content calendar/list
- [ ] Brand filter dropdown shows active brands
- [ ] Select a brand → list filters to that brand's content
- [ ] "All brands" → shows everything

## Test 10: No Brand = No Scan
- [ ] Content without a brand profile → no compliance badge
- [ ] Or score 100 with "No brand profile" indicator

## Test 11: Cross-Brand Isolation
- [ ] Create 2 brands with different forbidden words
- [ ] Content A (brand 1) checked against brand 1 rules only
- [ ] Content B (brand 2) checked against brand 2 rules only
- [ ] No cross-contamination

## Results: ___ / 11 passed

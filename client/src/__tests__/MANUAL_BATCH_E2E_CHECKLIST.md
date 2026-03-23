# Automated Batching — Manual E2E Test Checklist
# Date tested: ___________

## Setup
- [ ] Dev server running, pg-boss started (check logs)
- [ ] Content piece exists in marketing module
- [ ] LLM gateway configured (Groq + Claude keys)

## Test 1: Happy Path — 5 Channels
- [ ] Open content → "Atomize to Channels"
- [ ] BatchPanel opens, 5 channels listed
- [ ] Click "Atomize" → processing view
- [ ] Progress bar updates, per-channel statuses update
- [ ] All 5 complete → results view with links
- [ ] Close panel

## Test 2: Selective Channels
- [ ] Select only Email + Twitter
- [ ] Atomize → only 2 process
- [ ] Both complete, results show 2

## Test 3: View Derivatives
- [ ] Hero content shows derivative count badge
- [ ] "View derivatives" shows child content
- [ ] Each derivative links to parent

## Test 4: Email Derivative → VA2
- [ ] Open email derivative
- [ ] "Apply AI Draft" → VA2 manifest detected
- [ ] Unlayer loads assembled design

## Test 5: Retry Failed Channel
- [ ] Trigger or observe a failure
- [ ] Red X + error + Retry button
- [ ] Click Retry → re-processes → green check

## Test 6: Cancel Batch
- [ ] Start batch → Cancel while processing
- [ ] Confirm → status "Cancelled"
- [ ] Completed channels kept

## Test 7: Duplicate Prevention
- [ ] Try atomizing content with active batch → 409 error

## Test 8: Batch History
- [ ] Multiple batches show correct statuses

## Test 9: Long Content
- [ ] 500+ word content → all channels handle it
- [ ] Tweets ≤ 280, SMS ≤ 160

## Test 10: Brand Profile
- [ ] Content with brand profile → derivatives reflect voice
- [ ] No forbidden words in output

## Results: ___ / 10 passed

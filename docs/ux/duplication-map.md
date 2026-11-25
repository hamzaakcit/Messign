# Duplication Map

> **Update 2026-11-24 (UX-01 done):** §A is deleted. Eight files with uncommitted edits went into a named git stash first. The approval-queue page went too; review now happens on the offer and in Pipeline. Groups 4 (publish), 5 (schedule) and 6 (email layout) are resolved. Group 7 (`UnlayerEmailEditor` wrapper) remains, invisible to users. Group 1 (lists of content) is resolved in UX-04: the offer list with status filters replaced the Pipeline board, and `/marketing/pipeline`, `/content` and `/approvals` redirect to it. Group 9 (journey email) is resolved in UX-06: the offer and the post offer "Draft journey email" only while no email child exists. Group 8 (shop settings) is resolved in UX-05. **UX-08 (2026-11-25) closes groups 3 and 7:** the tab bar's New menu (Campaign, Content, Instagram post, Email) is one **New offer** button, so `ContentCreatePanel` (and its Instagram preset) and `CampaignCreatePanel` are deleted; `UnlayerEmailEditor` is deleted and its three callers use `UnlayerEditor displayMode="email"`; Lucy's channel modal keeps only the email brief, the one form the composer can open (LinkedIn, X, blog, ads and metrics were unreachable).

**As of:** 2026-11-24, `main`. Session UX-A, read-only. The method was a breadth-first import walk over the whole client from `client/src/App.tsx` (→ `components/layout/MainContent.tsx` lazy-loads `MarketingLayout`). It followed relative and `@/` imports and `React.lazy` edges, and every dead file was re-checked with a repo-wide grep. The walk covers the whole app because two marketing files are reached only from outside `pages/marketing` (`hooks/useMarketingApprovalQueue.ts`; the knowledge-hub chat bubble uses `components/marketing/LucyStructuredReply.tsx`).

**Result:** 182 marketing source files; **144 reachable, 38 unreachable (≈ 6,900 LOC, ≈ 19% of the marketing tree).**

## A. Unreachable code — delete first

These are the cheapest wins: nothing renders them, so deleting them changes no screen. Backend routes stay (ADR-001: delete UI only).

| Cluster | Files | LOC | Superseded by |
|---|---|---|---|
| Old "cockpit" context panel | `components/cockpit/{AutomationsPanel, CampaignDetailPanel, ChannelBadge, CockpitContextPanel, ContentActions, ContentDetailPanel, ContentRejectModal, ContentRenderer, EmptyContextPanel, InstagramIntelligencePanel, LeadDetailPanel, RepurposeModal, StatusBadge, ValidationScores}.tsx`, `cockpitTypes.ts`, `components/CockpitApprovalsList.tsx` | ≈ 2,150 | `components/{ContentDetailPanel, CampaignDetailPanel, LeadDetailPanel}.tsx`. **Keep** `cockpit/InstagramPreview.tsx` and `cockpit/Va2DiagnosticsPanel.tsx`; they are live (move them out of `cockpit/` when touched) |
| Approval-queue page | `MarketingApprovalQueuePage.tsx`, `components/approval/{ApprovalList, ChannelIcon, FeedbackModal, ReviewDetail, TelemetryPanel}.tsx`, `components/ComplianceBadge.tsx` | ≈ 800 | Nothing. `/marketing/approvals` redirects to the pipeline. **Decision needed** (see below) |
| Leads page | `MarketingLeadsPage.tsx` | 193 | Lead slide-over; leads belong to Engage |
| Old dashboards | `components/CeoDashboard.tsx`, `KPIStrip.tsx`, `MarketingMetricChips.tsx` | ≈ 585 | Nothing (frozen, ADR-001) |
| Old Instagram create path | `components/InstagramAgentPromptModal.tsx`, `lib/buildInstagramAgentMessage.ts`, `components/instagram/InstagramConnect.tsx` | ≈ 840 | `NewOfferPage.tsx` (MC-02). Tests `guidedCreate.test.tsx` and `buildInstagramAgentMessage.test.ts` go with them |
| Old Lucy drawer | `components/DoraDrawer.tsx` | 211 | `DoraRail.tsx` |
| Old campaigns board | `sections/CampaignsSection.tsx` | 510 | `/marketing/campaigns` → experiments redirect |
| Orphan helpers and barrels | `command-center/useMarketingCommandCenterData.ts`, `lib/lucyHubSectionCopy.ts`, `lib/index.ts`, `components/bento/{BentoCard.tsx, index.ts}`, `components/contentEmail/index.ts` | ≈ 425 | Data now comes from `MarketingContext`; barrels unused |

**Approval queue — the one cluster that is not pure cleanup.** The feature-maturity matrix lists "approval queue" as Real and Kept, and the master prompt names it as a redesign target. In the product today, review happens on the offer itself ("Looks good" → `submit_for_review`, CS-08 per-child approval) and in the pipeline's Review lane. Nobody can open the standalone queue page. Recommendation: delete the page; the offer screen plus the Review lane is the canonical approval surface. Keep `hooks/useMarketingApprovalQueue.ts` (live through `MarketingContext`). This needs your yes because it removes a surface the master prompt lists as kept.

## B. Live duplication groups

| # | Job | Copies (all reachable) | Canonical | Action |
|---|---|---|---|---|
| 1 | **List of my content** | Home offer list (`LucyMarketingPage`) · Pipeline board (`/marketing/pipeline`) · `/marketing/content` (same board, second URL) · Calendar list view | Home offer list | Already planned as MC-09: the pipeline becomes the offer list and `/content` redirects. The board's Live lane is also Mock (control-audit #2) |
| 2 | **Navigate the marketing area** | Home "More" menu (8 links) · `WorkspaceTopBar` (4 tabs + 4 under a CC dropdown) · Command-center shortcut buttons (Pipeline / Builder / Intel) · Brands FAB | One nav: the home header plus a back link on kept rooms | Cut the frozen links from both menus at once. Delete the CC shortcut buttons with the CC screens |
| 3 | **Create content** | New offer page (5 steps) · `ContentCreatePanel` slide-over (from calendar cell and from context, with an `instagram` preset) · Lucy composer Instagram tile (→ New offer) · Lucy composer channel tiles (LinkedIn / X / blog / ads) | `NewOfferPage` | Route the `instagram` preset to New offer. Keep `ContentCreatePanel` only for "add on this day" from the calendar. Drop the frozen-channel composer tiles (decision: ambiguous group) |
| 4 | **Publish / mark live** | Detail "Publish" rocket · drag to Live lane · Test publish · Calendar schedule + publisher cron | Schedule (calendar) + gated publish | Remove the rocket and the Live drop target (both Mock). Test publish stays behind the send gate |
| 5 | **Pick a schedule time** | Manual schedule (detail) · Auto-schedule (detail) · Auto (calendar list) · drag on calendar | Manual and drag | Remove both Auto buttons (Mock, hard-coded slots) |
| 6 | **Build the offer email layout** | "Apply AI draft" (sparkles) · "Build email layout" banner (same handler) | Apply AI draft | Delete the banner |
| 7 | **Email editor component** | `UnlayerEditor.tsx` · `UnlayerEmailEditor.tsx` (16-line wrapper, self-marked `@deprecated`) | `UnlayerEditor` | Inline `displayMode="email"` and delete the wrapper (code-only, invisible to users) |
| 8 | **Brand / shop settings** | Brands FAB slide-over (`TenantContentSetupPanel` + `BrandProfileManager`) · `ContentTenantSwitch` on the home header · "Brand & social" command-center column | A single Shop settings page | Already planned as MC-11. The CC column is frozen; hide it |
| 9 | **Draft the journey email** | Recipe auto-draft at New offer save · "Draft journey email" button on the detail | Auto-draft | Show the button only when the offer has no email child |
| 10 | **Funnel and leads** | `FunnelStrip` under the calendar · Funnel CC column · lead slide-over | Engage (WP-19, WP-21) | Remove from marketing (MC-13) |

## How this overlaps the marketing-counter track

Groups 1, 2, 8 and 10 are **already scheduled** as MC-09, MC-14, MC-11 and MC-13. Groups 4 and 5 sit inside MC-10 (calendar schedules a ready offer). The new items from this audit are §A (38 unreachable files, in no plan), groups 3, 6, 7 and 9, and the Mock controls. They are small and fit one "delete" package (see the session summary).

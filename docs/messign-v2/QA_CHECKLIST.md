# Manual QA matrix (v2 shell)

Run after layout-affecting changes.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sign in, land on home | No page scroll; bento fits viewport |
| 2 | Open Chat, send a message | Message list scrolls; channel rail scrolls; no body scroll |
| 3 | Socket / presence | No console errors; channels still update (existing `AppShell` handlers) |
| 4 | Marketing → workspace, open a content slide-over | Panel opens; main viewport does not scroll underneath |
| 5 | Projects → Opportunity Hub ↔ Tasks | Tabs switch; marketplace list scrolls inside pane |
| 6 | Home → hover bento tiles | Optional: Dora floating widget requests include `missionControlBento` when tile hovered |

/** Appended to {@link complianceScannerPrompt.ts} — Instagram-specific checks */
export const INSTAGRAM_COMPLIANCE_PROMPT_SECTION = `
### Check 10: Instagram — Image prompt requirement (TARGET_CHANNEL = instagram)

When TARGET_CHANNEL is "instagram" (or content is clearly intended for Instagram):

1. The content MUST contain an [IMAGE_PROMPT] ... [/IMAGE_PROMPT] block with
   substantive visual description (at least 20 characters of content inside).
   If missing: add a HIGH severity warning to channel_specific_issues.

2. Caption length must not exceed 2,200 characters (Instagram hard limit).
   If exceeded: HIGH severity warning.

3. Hashtags should be present (10-15 recommended). Fewer than 5: MEDIUM warning.
   More than 30: HIGH warning (Instagram may shadow-ban).

4. No clickable external links in caption body (Instagram does not support them).
   If a raw URL is detected in the caption (not in a "Link in bio" reference):
   MEDIUM warning suggesting "Link in bio" CTA instead.

5. No banned/spam hashtags. If you detect generic spam tags like #followforfollow,
   #likeforlike, #instagood with no topical relevance: MEDIUM warning.
`;

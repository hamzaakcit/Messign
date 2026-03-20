/** Appended to {@link brandVoiceCheckerPrompt.ts} */
export const BRAND_VOICE_CHANNEL_POLICIES = `
## Channel-specific voice policies (use TARGET_CHANNEL from the user message)

- **LinkedIn**: Professional register. Minimal emoji (0-2 total). Evidence-led claims.
  Avoid casual slang unless brand profile explicitly permits it.

- **X (Twitter)**: Concise and direct. Emoji acceptable (1-3). Personality-forward.

- **Email**: Warm but professional. Zero emoji in subject line. CTA-focused.

- **Instagram**: Conversational, lifestyle-oriented voice. Emoji acceptable (up to 5).
  Hashtags should feel curated, not stuffed. Visual-first thinking — if the caption
  does not complement a visual, note this in improvements.

  Instagram-specific checks:
  - If more than 5 emoji: flag in taboo_violations.
  - If tone is too corporate/stiff for Instagram: note in improvements.
  - If no call-to-action (question, save prompt, or link-in-bio): note in improvements.

- **Blog**: Authoritative, well-structured. No emoji. SEO-conscious without stuffing.

- **Ad copy**: Match the platform sub-type (Google Ads = concise, Facebook = storytelling).
`;

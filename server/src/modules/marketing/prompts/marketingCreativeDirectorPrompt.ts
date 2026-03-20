/**
 * CREATIVE DIRECTOR — Deliverable 3 §3.5 (balanced tier when wired to a dedicated loop).
 *
 * Produces structured creative briefs and visual guidance; does not generate pixels.
 * Brand visual layers are injected when available (otherwise placeholders).
 */

export interface MarketingCreativeDirectorPromptInput {
  userRole: string;
  /** Hex / palette description — maps to BRAND_COLORS. */
  brandColorsMd?: string;
  /** Font families, weights — maps to BRAND_FONTS. */
  brandFontsMd?: string;
  /** Logo usage, minimum sizes — maps to BRAND_LOGO_RULES. */
  brandLogoRulesMd?: string;
  /** URLs or refs to approved assets — maps to VISUAL_EXAMPLES. */
  visualExamplesMd?: string;
  organizationName?: string;
}

const NONE_LOADED = '(None loaded for this session.)';

const CREATIVE_DIRECTOR_STATIC_SPEC = `
## YOUR CAPABILITIES
- Generate structured **image briefs** for external generation APIs or human designers
- Check content and asset ideas against brand visual guidelines when data is injected below
- Repurpose content across visual formats (storyboard-style specs, not rendered assets)
- Optimize recommendations for platform-specific visual requirements (aspect ratio, safe zones)

## Image brief protocol
When the user asks for visual content, output a **structured brief** (JSON object) in your message, using this shape:

\`\`\`json
{
  "brief_type": "social_image|ad_creative|infographic|thumbnail",
  "description": "Natural language description of the visual",
  "style_direction": "Flat|Modern|Editorial|Photographic",
  "color_palette": ["#hex1", "#hex2"],
  "text_overlay": "Any text to appear on the image",
  "aspect_ratio": "1:1|16:9|4:5|9:16",
  "platform": "linkedin|twitter|instagram|facebook|blog",
  "brand_elements": ["logo_placement", "font_usage"]
}
\`\`\`

Pull \`color_palette\` from the injected brand colors when possible; flag any suggestion that drifts off-palette.

## Rules
- You produce **briefs and specifications**, not finished images. Say so plainly.
- If an image generation API exists in the session tools, you may only **submit** a brief via that tool when it is registered — otherwise the brief is for human designers or a future integration.
- Undirected work goes to **review**: Marketing hub / approval queue for design, not silent production.
- **Always** enforce the brand color palette from injections when present; call out off-brand hex suggestions.
- **Never** claim you designed, rendered, or exported an image file. Use phrasing like: "Here is a creative brief for…" or "I've prepared visual specifications for your designer."
- You are not the Content Strategist for long-form copy; coordinate messaging tone with product truth / brand voice if both agents are used in sequence.

## Tool honesty
- Registered tools for this role (when activated): \`creative:generate_image_brief\`, \`creative:check_brand_compliance\`, \`creative:repurpose_content\` — use exact names from the session allowlist.
- Do not imply Messign can auto-publish creative to ad platforms unless a tool result proves it.
- No web scraping of competitor creatives; use user-provided links or injected examples only.
`.trim();

export function buildMarketingCreativeDirectorPrompt(input: MarketingCreativeDirectorPromptInput): string {
  const {
    userRole,
    organizationName = 'Messign Workspace',
    brandColorsMd,
    brandFontsMd,
    brandLogoRulesMd,
    visualExamplesMd,
  } = input;

  const colors = brandColorsMd?.trim() || NONE_LOADED;
  const fonts = brandFontsMd?.trim() || NONE_LOADED;
  const logos = brandLogoRulesMd?.trim() || NONE_LOADED;
  const visuals = visualExamplesMd?.trim() || NONE_LOADED;

  return [
    `ROLE: Creative Director for ${organizationName} via Messign Workspace.`,
    `TIER: balanced (Groq-class) for fast brief iteration; keep outputs structured.`,
    `User role: ${userRole}.`,
    '',
    '---',
    '',
    '## Injected: Brand colors',
    '',
    colors,
    '',
    '---',
    '',
    '## Injected: Brand fonts',
    '',
    fonts,
    '',
    '---',
    '',
    '## Injected: Logo and mark rules',
    '',
    logos,
    '',
    '---',
    '',
    '## Injected: Visual examples (approved references)',
    '',
    visuals,
    '',
    '---',
    '',
    CREATIVE_DIRECTOR_STATIC_SPEC,
  ].join('\n');
}

export function getMarketingCreativeDirectorSystemPrompt(userRole: string): string {
  return buildMarketingCreativeDirectorPrompt({ userRole });
}

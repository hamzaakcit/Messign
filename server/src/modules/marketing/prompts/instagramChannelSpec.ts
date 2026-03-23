// ============================================================================
// Instagram Channel Spec — Content Strategist Prompt Additions
// ============================================================================
// File: server/src/modules/marketing/prompts/instagramChannelSpec.ts
//
// This exports the Instagram-specific block to merge into the
// CONTENT_STRATEGIST_STATIC_SPEC in marketingContentStrategistPrompt.ts.
//
// MERGE INSTRUCTIONS:
//   In marketingContentStrategistPrompt.ts, replace the flat "## Format rules"
//   section with the CHANNEL_SPECS block, or append this Instagram section
//   alongside the existing LinkedIn/X/Email/Blog specs.
// ============================================================================

export const INSTAGRAM_CHANNEL_SPEC = `
### Instagram

#### Caption structure
- **Hook** (line 1) — **Pattern Interrupt (required)**: Bold, curiosity-driven opening that
  contrasts with "default" founder marketing chaos. Speak directly to the reader.
  Use a question, a surprising stat, or a contrarian take — **not** generic SaaS filler.
  Max 125 characters before the "...more" fold on mobile.
- **Body** (lines 2–6): Story, insight, or value delivery. Keep paragraphs to
  1–2 sentences. Use line breaks liberally. Conversational, not corporate.
- **CTA** (final line before hashtags): Clear next step — "Save this for later",
  "Drop a [emoji] if you agree", "Link in bio", or a question to drive comments.
- **Emoji policy**: Up to **5 emoji** total in the caption. Use them as visual
  anchors (bullet replacements, section markers), never as filler. Place the
  strongest emoji in the hook line.
- **Hashtags**: End with a block of **10–15 hashtags** separated by spaces.
  Mix 3 tiers: 3–5 high-volume (500K+ posts), 5–7 mid-range (50K–500K),
  2–3 niche/branded. No banned or spam hashtags. On a new line after the CTA.

#### Visual synthesis (REQUIRED for every Instagram post)
For **every** Instagram draft, you MUST include a dedicated block in this
EXACT format — the orchestrator parses it programmatically:

\`\`\`
[IMAGE_PROMPT]
<Detailed visual description optimized for image generation. Include:
 - Subject: what is shown (product, person, scene, abstract)
 - Composition: layout, angle, framing (e.g., "minimalist flat-lay", "eye-level portrait", "wide establishing shot")
 - Lighting: quality and direction (e.g., "soft studio glow from upper-left", "golden hour backlight")
 - Color palette: 2-3 dominant colors that match brand guidelines
 - Mood/atmosphere: emotional tone (e.g., "confident and aspirational", "calm and focused")
 - On-image text: ONLY if the caption requires overlay text; otherwise "no text overlay"
 - Style: "Modern Noir, professional SaaS" OR match the brand aesthetic from BRAND_VOICE_PROFILE
 - Technical: "square 1:1 aspect ratio, professional marketing photography quality">
[/IMAGE_PROMPT]
\`\`\`

DO NOT skip the [IMAGE_PROMPT] block. DO NOT put it inside the caption text.
It must appear AFTER the full caption as a separate block.

If the user asks for a carousel (multiple images), produce one [IMAGE_PROMPT]
block per slide, numbered: [IMAGE_PROMPT:1], [IMAGE_PROMPT:2], etc.

#### Image source: [STOCK] vs AI-generated
Prefix your IMAGE_PROMPT with \`[STOCK]\` when **real photography** is better than AI:
- **Use [STOCK]**: real people (faces, hands, full-body), food/drink, fashion, travel, cityscapes, nature, office/workspace, fitness, events
- **Use AI (no prefix)**: abstract concepts, impossible scenes, futuristic visuals, stylized illustrations, neon/glassmorphism, data visualizations, custom product renders

**Anti-uncanny-valley rule**: When the image requires realistic human faces or hands, ALWAYS use \`[STOCK]\`. AI-generated people often have anatomical artifacts (extra fingers, lifeless eyes, waxy skin). If you must use AI for a scene with people, specify "stylized silhouette" or "abstract figures" instead.

#### Instagram Composition Framework
- **Rule of thirds**: Place the main subject at an intersection point, not dead center
- **Negative space**: Leave breathing room — especially important for Stories/Reels where text overlays need safe zones
- **Thumb-stopping hook**: The image must make someone stop scrolling in under 0.3 seconds. Use bold contrast, unexpected angles, or vivid color pops
- **Grid harmony**: Feed posts should look good both individually AND as part of the 3-column grid — avoid asymmetric crops

#### Golden IMAGE_PROMPT Examples

**Lifestyle with [STOCK] (food/wellness)**:
\`\`\`
[IMAGE_PROMPT]
[STOCK] Overhead flat-lay of a minimalist morning routine on white marble — matcha latte in ceramic cup, open journal with fountain pen, small succulent plant, soft natural window light from upper-left, warm neutral palette with sage green accents, aspirational wellness aesthetic, square 1:1 aspect ratio
[/IMAGE_PROMPT]
\`\`\`

**Abstract AI-generated (tech/SaaS)**:
\`\`\`
[IMAGE_PROMPT]
Isometric 3D illustration of interconnected floating data cubes and workflow nodes in a deep navy void, glowing cyan connection lines, subtle purple gradient fog at the base, clean geometric precision, Modern Noir aesthetic with electric purple (#c084fc) and deep charcoal (#1a1a2e) palette, no text overlay, square 1:1 aspect ratio, professional marketing quality
[/IMAGE_PROMPT]
\`\`\`

**Product spotlight (ecommerce)**:
\`\`\`
[IMAGE_PROMPT]
Close-up product hero shot of wireless earbuds on a matte black surface, one earbud standing upright catching a single directional studio light from upper-right, subtle reflection on surface, minimal composition with generous negative space on left third, deep charcoal and silver palette, premium product photography quality, square 1:1 aspect ratio, no text overlay
[/IMAGE_PROMPT]
\`\`\`

#### Content rules
- Max caption length: 2,200 characters (Instagram limit).
- No external links in caption body (Instagram does not make them clickable).
  Use "Link in bio" CTA instead.
- Alt-text: If the image contains meaningful visual information, suggest an
  accessibility alt-text line: [ALT_TEXT: "..."] after the IMAGE_PROMPT block.
- Reels/Stories: If the user requests a Reel or Story, note format differences
  in the IMAGE_PROMPT (vertical 9:16 aspect ratio, motion-friendly composition).

#### Instagram Formats
When the user specifies a format, follow these guidelines:

**Feed Post (default — 1:1 square)**
- Standard square image optimized for the feed grid
- Focus on strong composition that works at small thumbnail size
- IMAGE_PROMPT must specify "square 1:1 aspect ratio"

**Story (9:16 vertical)**
- Full-screen vertical format, 1080×1920px
- Use bold text overlays, stickers, or swipe-up CTAs
- Caption is optional (Stories show text on-image instead)
- IMAGE_PROMPT must specify "vertical 9:16 aspect ratio, full-bleed design with text-safe zones"
- Emphasize large, bold typography in the visual description

**Reel (9:16 vertical)**
- Short-form video cover frame, 1080×1920px
- Design as an attention-grabbing thumbnail/cover
- Include visual hooks: bold text, action mid-frame, dynamic composition
- IMAGE_PROMPT must specify "vertical 9:16 aspect ratio, dynamic video cover frame"
- Caption follows the same structure as feed posts but with Reels-specific hashtags
`;

// ============================================================================
// Full CHANNEL_SPECS block — replaces the old flat "## Format rules"
// ============================================================================
// This wraps all channels including Instagram. Merge into the static spec.

const LINKEDIN_SPEC = `### LinkedIn
- Style: Professional, concise, evidence-led.
- Structure: Hook in the first 2 lines (before the fold); short paragraphs
  separated by line breaks; CTA at the end.
- Limits: Max ~3,000 characters for feed text.
- Emoji: Minimal (0–2 total). Professional context.`;

const X_SPEC = `### X (Twitter)
- Style: Punchy, one core idea per post.
- Limits: 280 characters per post. Threads are numbered (1/N).
- No hashtag blocks — weave 1–2 hashtags naturally if relevant.`;

const EMAIL_LEGACY_SPEC = `### Email (marketing)
- **Required output shape** — use these labels so the app can parse and load the email builder:
  - \`SUBJECT:\` one line (aim under ~60 characters).
  - \`PREVIEW:\` one line (preheader, under ~90 characters).
  - \`BODY:\` then the email body (HTML-friendly: short paragraphs, optional bullets; avoid broken HTML).
- **Brand voice**: Follow **BRAND_VOICE_PROFILE** in your system prompt for tone, taboos, CTA phrasing, and proof/claims discipline.
- **Saved designs**: When a **Reference — saved email designs** block appears in context, align hook length, formality, CTA placement, and section rhythm with the closest matching example (by topic or title). Prefer mirroring those patterns over generic SaaS filler.
- One primary CTA above the fold. No fake RE:/Fwd: subjects.
- Plain-text fallback must be readable.
- **Repurpose tool**: Do **not** call \`creative:repurpose_content\` for net-new email copy from scratch. Only use it when explicitly repurposing from supplied long-form source text (e.g. blog → email variants). If you call it, pass valid \`source_content\` and canonical \`source_type\` in one shot — avoid empty or invalid calls.`;

const BLOG_SPEC = `### Blog
- H2/H3 heading structure; long-form ~800–1,500 words.
- Primary keyword in title + opening paragraph (no stuffing).
- Internal links to related content where natural.`;

const AD_SPEC = `### Ad copy
- Respect platform character limits; benefit-led; only approved claims.
- Include variant labels (e.g., "Variant A — urgency hook").`;

/**
 * Builds channel specs scoped to the active channel.
 * Email-only requests skip Instagram/LinkedIn/X/Blog/Ad specs (~2,500 tokens saved).
 * Instagram-only requests skip email legacy/blog specs (~1,500 tokens saved).
 * Unknown/multi-channel gets everything (backward-compatible).
 */
export function buildChannelSpecsBlock(channel?: string): string {
  const ch = channel?.trim().toLowerCase();

  if (ch === 'email') {
    return `## CHANNEL_SPECS (email)\n\n${EMAIL_LEGACY_SPEC}`;
  }
  if (ch === 'instagram') {
    return `## CHANNEL_SPECS (instagram)\n\n${INSTAGRAM_CHANNEL_SPEC}`;
  }
  if (ch === 'linkedin') {
    return `## CHANNEL_SPECS (linkedin)\n\n${LINKEDIN_SPEC}`;
  }
  if (ch === 'x' || ch === 'twitter') {
    return `## CHANNEL_SPECS (x)\n\n${X_SPEC}`;
  }
  if (ch === 'blog') {
    return `## CHANNEL_SPECS (blog)\n\n${BLOG_SPEC}`;
  }
  if (ch === 'ad' || ch === 'ad_copy') {
    return `## CHANNEL_SPECS (ad copy)\n\n${AD_SPEC}`;
  }

  return `## CHANNEL_SPECS (follow the channel matching the user request)

${LINKEDIN_SPEC}

${X_SPEC}

${EMAIL_LEGACY_SPEC}

${BLOG_SPEC}

${INSTAGRAM_CHANNEL_SPEC}

${AD_SPEC}`;
}

/** @deprecated Use buildChannelSpecsBlock(channel) for token-efficient prompts */
export const CHANNEL_SPECS_BLOCK = buildChannelSpecsBlock();

// ============================================================================
// IMAGE_PROMPT extraction utility
// ============================================================================
// Used by the orchestration workflow to parse the agent's output.

export interface ParsedImagePrompt {
  index: number;
  prompt: string;
}

/**
 * Extracts [IMAGE_PROMPT] blocks from agent output.
 * Supports both single and carousel formats:
 *   [IMAGE_PROMPT] ... [/IMAGE_PROMPT]
 *   [IMAGE_PROMPT:1] ... [/IMAGE_PROMPT:1]
 */
/** First [IMAGE_PROMPT] block only — convenience for single-image flows. */
export function extractImagePrompt(agentOutput: string): string | null {
  const prompts = extractImagePrompts(agentOutput);
  return prompts[0]?.prompt ?? null;
}

export function extractImagePrompts(agentOutput: string): ParsedImagePrompt[] {
  const results: ParsedImagePrompt[] = [];

  // Pre-process: strip markdown bold/italic markers and stray backticks wrapping the tags
  const cleaned = agentOutput
    .replace(/\*{1,2}\[/g, '[')
    .replace(/\]\*{1,2}/g, ']')
    .replace(/`\[/g, '[')
    .replace(/\]`/g, ']');

  // Pattern 1: [IMAGE_PROMPT] ... [/IMAGE_PROMPT]  (tolerates [IMAGE PROMPT], [ IMAGE_PROMPT ], whitespace)
  const singlePattern = /\[\s*IMAGE[\s_]PROMPT\s*\]\s*([\s\S]*?)\s*\[\s*\/\s*IMAGE[\s_]PROMPT\s*\]/gi;
  let match: RegExpExecArray | null;

  while ((match = singlePattern.exec(cleaned)) !== null) {
    const prompt = match[1].trim();
    if (prompt.length > 10) {
      results.push({ index: results.length, prompt });
    }
  }

  // Pattern 2: [IMAGE_PROMPT:N] ... [/IMAGE_PROMPT:N]
  const carouselPattern = /\[\s*IMAGE[\s_]PROMPT\s*:\s*(\d+)\s*\]\s*([\s\S]*?)\s*\[\s*\/\s*IMAGE[\s_]PROMPT\s*:\s*\1\s*\]/gi;

  while ((match = carouselPattern.exec(cleaned)) !== null) {
    const idx = parseInt(match[1], 10) - 1;
    const prompt = match[2].trim();
    if (prompt.length > 10) {
      results.push({ index: idx, prompt });
    }
  }

  // Pattern 3: Unclosed [IMAGE_PROMPT] — LLM sometimes forgets closing tag.
  // Only activates when no paired tags were found AND no closing tag exists.
  if (results.length === 0 && !/\[\s*\/\s*IMAGE[\s_]PROMPT/i.test(cleaned)) {
    const unclosedPattern = /\[\s*IMAGE[\s_]PROMPT\s*(?::\s*\d+\s*)?\]\s*([\s\S]{15,}?)(?:\n{2,}|\[(?:ALT|\/)|$)/gi;
    while ((match = unclosedPattern.exec(cleaned)) !== null) {
      const prompt = match[1].trim();
      if (prompt.length > 10 && !prompt.startsWith('#') && !prompt.startsWith('@')) {
        results.push({ index: results.length, prompt });
      }
    }
  }

  return results;
}

/**
 * Extracts the caption text by removing [IMAGE_PROMPT] blocks,
 * [ALT_TEXT] lines, and trimming whitespace.
 */
export function extractCaption(agentOutput: string): string {
  return agentOutput
    .replace(/\*{1,2}\[/g, '[')
    .replace(/\]\*{1,2}/g, ']')
    .replace(/`\[/g, '[')
    .replace(/\]`/g, ']')
    // Fenced block that wraps IMAGE_PROMPT (common in LLM output)
    .replace(/```[\s\S]*?\[\s*IMAGE[\s_]PROMPT[\s\S]*?\[\s*\/\s*IMAGE[\s_]PROMPT\s*\][\s\S]*?```/gi, '')
    // Inline IMAGE_PROMPT blocks (with or without carousel index)
    .replace(/\[\s*IMAGE[\s_]PROMPT\s*(?::\s*\d+\s*)?\][\s\S]*?\[\s*\/\s*IMAGE[\s_]PROMPT\s*(?::\s*\d+\s*)?\]/gi, '')
    // Unclosed IMAGE_PROMPT at end of output
    .replace(/\[\s*IMAGE[\s_]PROMPT\s*(?::\s*\d+\s*)?\][\s\S]*$/gi, '')
    .replace(/\[\s*ALT[\s_]TEXT\s*:.*?\]/gi, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim();
}

/**
 * Extracts alt-text suggestions from agent output.
 */
export function extractAltText(agentOutput: string): string | null {
  const match = agentOutput.match(/\[ALT_TEXT:\s*"?(.*?)"?\s*\]/i);
  return match?.[1]?.trim() ?? null;
}

export default {
  INSTAGRAM_CHANNEL_SPEC,
  CHANNEL_SPECS_BLOCK,
  extractImagePrompts,
  extractCaption,
  extractAltText,
};

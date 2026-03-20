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
- **Hook** (line 1): Bold, curiosity-driven opening. Speak directly to the reader.
  Use a question, a surprising stat, or a contrarian take. Max 125 characters
  before the "...more" fold on mobile.
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

#### Content rules
- Max caption length: 2,200 characters (Instagram limit).
- No external links in caption body (Instagram does not make them clickable).
  Use "Link in bio" CTA instead.
- Alt-text: If the image contains meaningful visual information, suggest an
  accessibility alt-text line: [ALT_TEXT: "..."] after the IMAGE_PROMPT block.
- Reels/Stories: If the user requests a Reel or Story, note format differences
  in the IMAGE_PROMPT (vertical 9:16 aspect ratio, motion-friendly composition).
`;

// ============================================================================
// Full CHANNEL_SPECS block — replaces the old flat "## Format rules"
// ============================================================================
// This wraps all channels including Instagram. Merge into the static spec.

export const CHANNEL_SPECS_BLOCK = `
## CHANNEL_SPECS (follow the channel matching the user request)

### LinkedIn
- Style: Professional, concise, evidence-led.
- Structure: Hook in the first 2 lines (before the fold); short paragraphs
  separated by line breaks; CTA at the end.
- Limits: Max ~3,000 characters for feed text.
- Emoji: Minimal (0–2 total). Professional context.

### X (Twitter)
- Style: Punchy, one core idea per post.
- Limits: 280 characters per post. Threads are numbered (1/N).
- No hashtag blocks — weave 1–2 hashtags naturally if relevant.

### Email (marketing)
- Subject line under ~60 characters; preview text under ~90.
- One primary CTA above the fold. No fake RE:/Fwd: subjects.
- Plain-text fallback must be readable.

### Blog
- H2/H3 heading structure; long-form ~800–1,500 words.
- Primary keyword in title + opening paragraph (no stuffing).
- Internal links to related content where natural.

${INSTAGRAM_CHANNEL_SPEC}

### Ad copy
- Respect platform character limits; benefit-led; only approved claims.
- Include variant labels (e.g., "Variant A — urgency hook").
`;

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
export function extractImagePrompts(agentOutput: string): ParsedImagePrompt[] {
  const results: ParsedImagePrompt[] = [];

  // Pattern 1: [IMAGE_PROMPT] ... [/IMAGE_PROMPT]
  const singlePattern = /\[IMAGE_PROMPT\]\s*([\s\S]*?)\s*\[\/IMAGE_PROMPT\]/gi;
  let match: RegExpExecArray | null;

  while ((match = singlePattern.exec(agentOutput)) !== null) {
    const prompt = match[1].trim();
    if (prompt.length > 10) {
      results.push({ index: results.length, prompt });
    }
  }

  // Pattern 2: [IMAGE_PROMPT:N] ... [/IMAGE_PROMPT:N]
  const carouselPattern = /\[IMAGE_PROMPT:(\d+)\]\s*([\s\S]*?)\s*\[\/IMAGE_PROMPT:\1\]/gi;

  while ((match = carouselPattern.exec(agentOutput)) !== null) {
    const idx = parseInt(match[1], 10) - 1; // 1-indexed → 0-indexed
    const prompt = match[2].trim();
    if (prompt.length > 10) {
      results.push({ index: idx, prompt });
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
    .replace(/\[IMAGE_PROMPT(?::\d+)?\][\s\S]*?\[\/IMAGE_PROMPT(?::\d+)?\]/gi, '')
    .replace(/\[ALT_TEXT:.*?\]/gi, '')
    .replace(/```[\s\S]*?```/g, '') // Remove any leftover code fences
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

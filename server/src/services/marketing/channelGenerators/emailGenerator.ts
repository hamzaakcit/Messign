/**
 * Email Channel Generator — v2 Pro
 *
 * Produces a VA2 DesignManifest JSON from hero content using an
 * agency-quality creative director + copywriter system prompt.
 * Includes per-section art direction, compelling copy, and
 * detailed image prompts for fal.ai / DALL-E generation.
 */

import type { GeneratorInput, GeneratorOutput, LLMCallFunction, ChannelGenerator } from './types.js';

export const emailGenerator: ChannelGenerator = async (
  input: GeneratorInput,
  callLLM: LLMCallFunction,
): Promise<GeneratorOutput> => {
  const { heroContent, brandProfile } = input;

  const systemPrompt = buildEmailSystemPrompt(brandProfile);
  const userMessage = buildEmailUserMessage(heroContent);

  const llmResponse = await callLLM({
    model: 'creative',
    systemPrompt,
    userMessage,
    maxTokens: 6000,
  });

  const manifest = extractManifestJson(llmResponse);

  return {
    channel: 'email',
    title: (manifest?.subject as string) || `Email: ${heroContent.title}`,
    body: llmResponse,
    channelMetadata: {
      generator: 'va2-batch-pro',
      has_manifest: !!manifest,
      theme: (manifest?.theme as string) || 'minimal',
      section_count: Array.isArray(manifest?.sections) ? (manifest.sections as unknown[]).length : 0,
    },
    designManifest: manifest || undefined,
  };
};

function buildEmailSystemPrompt(brandProfile?: GeneratorInput['brandProfile']): string {
  let prompt = `You are a senior creative director at a world-class email design agency.
You create award-winning email campaigns that rival Apple, Stripe, and Airbnb quality.

═══════════════════════════════════════════════════════
CRITICAL OUTPUT RULES
═══════════════════════════════════════════════════════

1. Output ONLY a JSON code fence. Nothing else. No preamble, no explanation.
2. NEVER write "Here's..." or "I've created..." or any commentary.
3. Go STRAIGHT to the \`\`\`json fence — zero text before or after it.
4. Any text outside the JSON fence will break the pipeline.
5. All copy must be real, polished, send-ready text — NEVER placeholder text like "[Company Name]" or "[Your Name]".

═══════════════════════════════════════════════════════
MANIFEST SCHEMA
═══════════════════════════════════════════════════════

{
  "version": "2.0",
  "theme": "<executive|startup|luxury|minimal|bold|nature|tech|warm>",
  "subject": "<35-55 chars, curiosity gap or benefit-driven>",
  "preheader": "<90-130 chars, complements subject, includes soft CTA>",
  "sections": [ ... ],
  "metadata": {
    "channel": "email",
    "tone": "<2-3 tone keywords>",
    "audience": "<target audience>"
  },
  "artDirection": {
    "colorTemperature": "<warm|cool|neutral>",
    "overallMood": "<one-line mood description>",
    "visualStyle": "<editorial_photography|minimal_clean|cinematic|illustration>"
  }
}

═══════════════════════════════════════════════════════
SECTION TYPES & CONTENT SCHEMAS
═══════════════════════════════════════════════════════

Each section: { "type": "<type>", "order": <N>, "content": { ... } }

HERO (order: 1 — always first):
  content: {
    "headline": "<4-8 words, power verb + benefit>",
    "subheadline": "<12-20 words, expands the promise>",
    "ctaText": "<2-4 words: 'Shop the Collection'>",
    "ctaUrl": "#",
    "imagePrompt": "<REQUIRED, 50-80 words — cinematic scene with lighting, angle, mood, and MUST include 'negative space for text overlay'>"
  }

VALUE_PROP (2-3 column grid):
  content: {
    "columns": 3,
    "items": [
      { "icon": "<Zap|Shield|Users|Clock|Star|Heart|Target|Rocket|Globe|Lock|Sparkles|TrendingUp|Award|CheckCircle>", "heading": "<3-5 words>", "text": "<1-2 sentences>" }
    ]
  }

TESTIMONIAL:
  content: {
    "quote": "<1-2 sentence quote with specific result or metric>",
    "authorName": "<Full Name>",
    "role": "<Title, Company>",
    "rating": 5,
    "imagePrompt": "<REQUIRED, 40-60 words — professional headshot description with lighting and background>"
  }

SOCIAL_PROOF:
  content: {
    "style": "<metrics|logos|mixed>",
    "items": [
      { "value": "<metric>", "label": "<descriptor>" }
    ]
  }

STATS_COUNTER:
  content: {
    "items": [
      { "value": "<10K+|99.9%|$2M>", "label": "<2-4 word descriptor>" }
    ]
  }

IMAGE_TEXT (side-by-side image + text — USE THIS FOR RICH VISUAL SECTIONS):
  content: {
    "layout": "<image_left|image_right>",
    "headline": "<benefit-driven heading>",
    "body": "<2-3 sentences of supporting text>",
    "imagePrompt": "<REQUIRED, 50-80 words — editorial scene description with lighting, composition, mood>",
    "ctaText": "<optional micro-CTA>",
    "ctaUrl": "#"
  }

CTA (standalone call-to-action):
  content: {
    "headline": "<urgency or benefit headline>",
    "description": "<1 sentence>",
    "buttonText": "<2-4 word action phrase>",
    "buttonUrl": "#",
    "variant": "<pill|ghost|fullWidth|gradient>"
  }

TEXT_BLOCK:
  content: { "body": "<HTML-safe paragraph>" }

DIVIDER:
  content: { "style": "<line|dots|gradient>" }

LOGO_BAR:
  content: {
    "headline": "<Trusted by|As seen in>",
    "items": [ { "name": "<Company>", "logoUrl": "", "altText": "<logo>" } ]
  }

FOOTER (always last):
  content: {
    "companyName": "<brand name>",
    "address": "<address>",
    "unsubscribeText": "Unsubscribe",
    "socialLinks": [{ "platform": "<twitter|linkedin|instagram>", "url": "#" }]
  }

═══════════════════════════════════════════════════════
MANDATORY EMAIL STRUCTURE
═══════════════════════════════════════════════════════

Every email MUST have 8-12 sections following this pattern:

1. HERO — with imagePrompt (50-80 words)
2. VALUE_PROP or TEXT_BLOCK — introduce key benefits
3. IMAGE_TEXT (layout: "image_left") — with imagePrompt (50-80 words)
4. IMAGE_TEXT (layout: "image_right") — with imagePrompt (50-80 words), different angle
5. TESTIMONIAL or SOCIAL_PROOF — social proof after claims
6. IMAGE_TEXT or STATS_COUNTER — additional content depth
7. CTA — clear conversion moment
8. FOOTER — with social links

MINIMUM IMAGE SECTIONS: 4 (hero + 2 image_text + 1 testimonial).
Every hero, image_text, and testimonial section MUST have an imagePrompt of 50+ words.
Alternate image_text layouts: first "image_left", next "image_right", etc.

═══════════════════════════════════════════════════════
COPY QUALITY RULES
═══════════════════════════════════════════════════════

- Subject: Curiosity gap, numbers, or personalization. "Your Q4 growth playbook is ready" > "Newsletter #47"
- Headlines: Active voice, benefit-first, power words: transform, unlock, discover, accelerate
- CTAs: Specific action + outcome. "Get My Free Report" > "Submit". "Start Building" > "Click Here"
- Body: Short paragraphs, conversational, you-focused. Talk TO the reader, not AT them
- Value props: Parallel structure. Lead with benefit, not feature name
- NEVER use placeholder text. Write real copy that's ready to send

IMAGE PROMPT RULES:
- Every imagePrompt must be 50-80 words — detailed and specific
- Include: subject matter, setting, lighting direction, camera angle, color mood
- Hero: "cinematic wide-angle, dramatic lighting, negative space for text overlay"
- Image_text: "editorial lifestyle photography, natural window lighting, magazine quality"
- Testimonial: "professional headshot, warm studio lighting, blurred office background"
- Be SPECIFIC: "A woman in a navy blazer reviewing..." NOT "professional person"

THEME SELECTION:
- Product launch → bold/startup. Newsletter → minimal/executive. Sale → warm/bold
- Luxury: premium, refined. Tech: futuristic. Nature: earthy. Warm: friendly`;

  if (brandProfile) {
    prompt += `

═══════════════════════════════════════════════════════
BRAND CONTEXT
═══════════════════════════════════════════════════════
- Brand: ${brandProfile.brand_name}
- Tone: ${brandProfile.tone_keywords.join(', ')}
- Forbidden words: ${brandProfile.forbidden_words.join(', ')}
- Voice: ${brandProfile.voice_examples.slice(0, 3).join(' | ')}`;
    if (brandProfile.style_guide_notes) {
      prompt += `\n- Style notes: ${brandProfile.style_guide_notes}`;
    }
  }

  return prompt;
}

function buildEmailUserMessage(heroContent: GeneratorInput['heroContent']): string {
  const contentType = inferContentType(heroContent.title, heroContent.body);

  return `Create a premium email Design Manifest for:

TITLE: ${heroContent.title}

CONTENT:
${heroContent.body}

CONTENT TYPE: ${contentType}

REQUIREMENTS:
- 8-12 sections with at least 4 image-bearing sections
- Every imagePrompt must be 50+ words, cinematic and specific
- Alternate image_text layouts (image_left, image_right)
- Real, polished copy — no placeholders, no meta-commentary
- Choose a theme that matches the content's emotional core

IMPORTANT: Output ONLY the \`\`\`json code fence. No text before or after.`;
}

function inferContentType(title: string, body: string): string {
  const combined = `${title} ${body}`.toLowerCase();
  if (/launch|new|introducing|announcing|release/i.test(combined)) return 'product_launch';
  if (/sale|discount|off|deal|save|promo/i.test(combined)) return 'flash_sale';
  if (/event|webinar|conference|summit|register|rsvp/i.test(combined)) return 'event_invitation';
  if (/welcome|onboard|getting started|first steps/i.test(combined)) return 'onboarding';
  if (/case study|success story|how .* achieved/i.test(combined)) return 'case_study';
  if (/digest|roundup|weekly|monthly|newsletter/i.test(combined)) return 'newsletter';
  if (/update|feature|improvement|changelog/i.test(combined)) return 'feature_update';
  if (/miss you|come back|re-engage|inactive/i.test(combined)) return 're_engagement';
  if (/holiday|season|spring|summer|fall|winter|christmas|halloween|valentine/i.test(combined)) return 'seasonal';
  return 'general_marketing';
}

function extractManifestJson(llmResponse: string): Record<string, unknown> | null {
  // Try standard code fence extraction first
  const fenceMatch = llmResponse.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      const cleaned = fenceMatch[1]
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/'/g, '"');
      try {
        return JSON.parse(cleaned);
      } catch {
        // fall through to other strategies
      }
    }
  }

  // Fallback: strip any text before first { and after last }
  const firstBrace = llmResponse.indexOf('{');
  const lastBrace = llmResponse.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonCandidate = llmResponse.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(jsonCandidate);
    } catch {
      const cleaned = jsonCandidate
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/'/g, '"');
      try {
        return JSON.parse(cleaned);
      } catch {
        // give up
      }
    }
  }

  return null;
}

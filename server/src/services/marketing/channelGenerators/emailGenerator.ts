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
    maxTokens: 4000,
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
  let prompt = `You are a senior creative director and copywriter at a world-class design agency.
Your team creates award-winning email campaigns for brands like Apple, Stripe, and Airbnb.

Your task: produce a Visual Architect v2 Design Manifest — a structured JSON that drives an
automated email assembly system. Every decision you make should reflect premium design thinking.

Output a single JSON object wrapped in \`\`\`json code fences.
The JSON must be valid — no trailing commas, no comments, no single quotes.

═══════════════════════════════════════════════════════
MANIFEST SCHEMA
═══════════════════════════════════════════════════════

{
  "version": "2.0",
  "theme": "<executive|startup|luxury|minimal|bold|nature|tech|warm>",
  "subject": "<35-55 chars, curiosity gap or benefit-driven, no ALL CAPS>",
  "preheader": "<90-130 chars, complements subject — never repeat it, include soft CTA>",
  "sections": [ ... ],
  "metadata": {
    "channel": "email",
    "tone": "<2-3 tone keywords>",
    "audience": "<target audience description>"
  },
  "artDirection": {
    "colorTemperature": "<warm|cool|neutral>",
    "overallMood": "<one-line mood description>",
    "visualStyle": "<editorial_photography|3D_isometric|minimal_clean|cinematic|illustration>"
  }
}

═══════════════════════════════════════════════════════
SECTION TYPES & CONTENT SCHEMAS
═══════════════════════════════════════════════════════

Each section: { "type": "<type>", "order": <N>, "content": { ... }, "artDirection": { ... } }

HERO (order: 1 — always first):
  content: {
    "headline": "<4-8 words, power verb + benefit, active voice>",
    "subheadline": "<12-20 words, expands the promise, creates curiosity>",
    "ctaText": "<2-4 words, action verb + outcome: 'Start Saving Today'>",
    "ctaUrl": "#",
    "imagePrompt": "<40-80 word scene description for AI image generation — cinematic, specific, directional>"
  }
  artDirection: { "imageStyle": "cinematic-hero", "imageMood": "<warm|cool|dramatic>", "imageColorHint": "<hex>" }

VALUE_PROP (2-3 column grid):
  content: {
    "columns": 3,
    "items": [
      {
        "icon": "<Zap|Shield|Users|Clock|Star|Heart|Target|Rocket|Globe|Lock|Sparkles|TrendingUp|Award|CheckCircle>",
        "heading": "<benefit-first, 3-5 words>",
        "text": "<1-2 sentences, specific and concrete, not vague>"
      }
    ]
  }

TESTIMONIAL:
  content: {
    "quote": "<powerful 1-2 sentence quote with specific result or metric>",
    "author": "<Full Name>",
    "role": "<Title, Company>",
    "rating": 5,
    "imagePrompt": "<professional portrait description>"
  }
  artDirection: { "imageStyle": "portrait-headshot", "imageMood": "warm" }

SOCIAL_PROOF:
  content: {
    "style": "<metrics|logos|mixed>",
    "items": [
      { "value": "<metric>", "label": "<what it measures>" }
    ]
  }

STATS_COUNTER:
  content: {
    "items": [
      { "value": "<big number with unit: 10K+, 99.9%, $2M>", "label": "<2-4 word descriptor>" }
    ]
  }

IMAGE_TEXT:
  content: {
    "imagePosition": "<left|right>",
    "headline": "<benefit-driven heading>",
    "text": "<supporting paragraph, 2-3 sentences>",
    "imagePrompt": "<editorial scene description>",
    "ctaText": "<optional micro-CTA>",
    "ctaUrl": "#"
  }
  artDirection: { "imageStyle": "editorial-lifestyle", "imageMood": "<warm|cool>" }

CTA (standalone call-to-action):
  content: {
    "headline": "<urgency or benefit headline>",
    "description": "<1 sentence supporting text>",
    "buttonText": "<2-4 word action phrase>",
    "buttonUrl": "#",
    "variant": "<pill|ghost|fullWidth|gradient>",
    "urgencyText": "<optional: 'Limited time' / 'Only 3 days left'>"
  }

TEXT_BLOCK:
  content: { "text": "<HTML-safe paragraph text>" }

DIVIDER:
  content: { "style": "<line|dots|gradient>" }

LOGO_BAR:
  content: {
    "headline": "<Trusted by|As seen in|Partners>",
    "items": [
      { "name": "<Company>", "logoUrl": "", "altText": "<Company Name logo>" }
    ]
  }

FOOTER (always last):
  content: {
    "companyName": "<brand name>",
    "address": "<brief address>",
    "unsubscribeText": "Unsubscribe",
    "socialLinks": [{ "platform": "<twitter|linkedin|instagram>", "url": "#" }]
  }

═══════════════════════════════════════════════════════
CREATIVE DIRECTION RULES
═══════════════════════════════════════════════════════

COPY QUALITY:
- Subject line: Use curiosity gap, numbers, or personalization. "Your Q4 growth playbook is ready" > "Newsletter #47"
- Headlines: Active voice, benefit-first, emotionally resonant. Power words: transform, unlock, master, discover, accelerate
- Subheadlines: Expand the promise. If headline = "what", subheadline = "how" or "why it matters"
- CTA buttons: Specific action + outcome. "Get My Free Report" > "Submit". "Start Building" > "Click Here"
- Body copy: Short paragraphs, conversational, you-focused (talk TO the reader, not AT them)
- Value props: Parallel structure across items. Lead with the benefit, not the feature name

IMAGE PROMPTS:
- Write each imagePrompt as a detailed 40-80 word scene description
- Include: subject, setting, lighting direction, camera angle, color mood, one surprising detail
- Hero images: cinematic wide-angle, dramatic lighting, MUST include "negative space for text overlay"
- Feature images: clean conceptual illustration style, single idea per image
- Testimonial: "professional headshot, warm studio lighting, authentic smile, blurred office background"
- Product: "studio product photography, clean background, hero lighting, sharp detail"

SECTION ORCHESTRATION:
- 5-7 sections total (hero + 3-5 middle + footer)
- Create visual rhythm: heavy section → light section → CTA
- Don't use dividers between every section — only when shifting context
- Place testimonial or social proof AFTER value propositions (proof after claims)
- End with a clear CTA section before footer

THEME SELECTION:
- Match theme to content tone. Product launch → bold/startup. Newsletter → minimal/executive. Sale → warm/bold.
- Executive: corporate, trustworthy. Startup: energetic, modern. Luxury: premium, refined.
- Minimal: clean, focused. Bold: high-impact. Nature: organic, earthy. Tech: futuristic. Warm: friendly.`;

  if (brandProfile) {
    prompt += `

═══════════════════════════════════════════════════════
BRAND CONTEXT (honor these constraints)
═══════════════════════════════════════════════════════
- Brand: ${brandProfile.brand_name}
- Tone keywords: ${brandProfile.tone_keywords.join(', ')}
- Forbidden words: ${brandProfile.forbidden_words.join(', ')}
- Voice examples: ${brandProfile.voice_examples.slice(0, 3).join(' | ')}`;
    if (brandProfile.style_guide_notes) {
      prompt += `\n- Style notes: ${brandProfile.style_guide_notes}`;
    }
  }

  return prompt;
}

function buildEmailUserMessage(heroContent: GeneratorInput['heroContent']): string {
  const contentType = inferContentType(heroContent.title, heroContent.body);

  return `Create a premium email Design Manifest for the following content:

TITLE: ${heroContent.title}

CONTENT:
${heroContent.body}

ANALYSIS:
- Content type detected: ${contentType}
- Adapt the hero content into a visually stunning, conversion-optimized email
- Choose a theme that amplifies the content's emotional core
- Write image prompts that are specific and cinematic — no generic stock descriptions
- Every section should earn its place — cut anything that doesn't serve the reader

Produce the JSON manifest now.`;
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
  const fenceMatch = llmResponse.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
  if (!fenceMatch) return null;
  try {
    return JSON.parse(fenceMatch[1]);
  } catch {
    const cleaned = fenceMatch[1]
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/'/g, '"');
    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

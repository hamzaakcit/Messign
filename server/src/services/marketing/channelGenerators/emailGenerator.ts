/**
 * Email Channel Generator
 *
 * Produces a VA2 DesignManifest JSON from the hero content.
 * Uses Claude (creative model) for complex structured JSON output,
 * theme selection, art direction, and section-level content decisions.
 */

import type { GeneratorInput, GeneratorOutput, LLMCallFunction, ChannelGenerator } from './types.js';
import { VA2_EMAIL_MANIFEST_SCHEMA_JSON_MIN } from '../../../modules/marketing/va2EmailManifestSchemaShared.js';

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
    maxTokens: 2000,
  });

  const manifest = extractManifestJson(llmResponse);

  return {
    channel: 'email',
    title: (manifest?.subject as string) || `Email: ${heroContent.title}`,
    body: llmResponse,
    channelMetadata: {
      generator: 'va2-batch',
      has_manifest: !!manifest,
      theme: (manifest?.theme as string) || 'minimal',
      section_count: Array.isArray(manifest?.sections) ? (manifest.sections as unknown[]).length : 0,
    },
    designManifest: manifest || undefined,
  };
};

function buildEmailSystemPrompt(brandProfile?: GeneratorInput['brandProfile']): string {
  let prompt = `You are an expert email marketing content strategist.
Your task is to create a Visual Architect v2 Design Manifest — a structured JSON
that drives an automated email assembly system.

Output a single JSON object wrapped in \`\`\`json code fences.
The JSON must be valid — no trailing commas, no comments, no single quotes.

Canonical manifest JSON (same as Content Strategist — extend with concrete sections):
${VA2_EMAIL_MANIFEST_SCHEMA_JSON_MIN}

Representative section rows (hero → value_prop → image_text → product_grid → footer):
- hero with headline, imagePrompt, ctaText, ctaUrl, altText
- value_prop with columns 2|3 and items with icon, heading, description
- image_text with layout image_left|image_right
- product_grid with items name, price, imagePrompt
- footer with companyName, address, links

Section types: hero, preheader, value_prop, testimonial, social_proof, text_block, image, image_text, product_grid, cta, divider, footer.
CTA variants: pill (rounded), ghost (outlined), fullWidth.
Icons: Zap, Shield, Users, Clock, Star, Heart, Target, Rocket, Globe, Lock.

Always include hero (first) and footer (last). Set metadata.target_image_slots to 6 by default (3–12) and aim for that many countable image slots (hero + image_text / product_grid / value_prop with imagePrompt) unless metadata.visual_density is minimal. For promotional mail, include hero plus at least two image-bearing body sections (image_text, image, product_grid, or value_prop items with imagePrompt); add divider, testimonial, or social_proof where they fit—avoid text_block-only bodies. Optional top-level layoutDensity: airy | normal | compact (typography/spacing). Optional hero.content.heroLayout: "editorial_tall" (taller photo band) or "split" (copy column + image column). The pipeline may auto-append image_text when slots are low — prefer explicit sections in JSON.`;

  if (brandProfile) {
    prompt += `\n\nBrand Profile:
- Brand: ${brandProfile.brand_name}
- Tone: ${brandProfile.tone_keywords.join(', ')}
- Forbidden words: ${brandProfile.forbidden_words.join(', ')}
- Voice: ${brandProfile.voice_examples.slice(0, 2).join(' | ')}`;
    if (brandProfile.style_guide_notes) {
      prompt += `\n- Style notes: ${brandProfile.style_guide_notes}`;
    }
  }

  return prompt;
}

function buildEmailUserMessage(heroContent: GeneratorInput['heroContent']): string {
  return `Create an email Design Manifest based on this hero content:

Title: ${heroContent.title}
Content: ${heroContent.body}

Adapt the hero content into a compelling email with appropriate sections.
Choose a theme that matches the content tone.`;
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

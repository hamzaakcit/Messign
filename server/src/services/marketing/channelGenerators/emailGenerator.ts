/**
 * Email Channel Generator
 *
 * Produces a VA2 DesignManifest JSON from the hero content.
 * Uses Claude (creative model) for complex structured JSON output,
 * theme selection, art direction, and section-level content decisions.
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

Schema:
{
  "version": "2.0",
  "theme": "<executive|startup|luxury|minimal|bold|nature|tech|warm>",
  "subject": "<40-60 chars, benefit-driven>",
  "preheader": "<100-140 chars, complements subject>",
  "sections": [
    { "type": "hero", "order": 1, "content": { "headline": "...", "subheadline": "...", "ctaText": "...", "ctaUrl": "#", "imagePrompt": "..." } },
    { "type": "value_prop", "order": 2, "content": { "columns": 3, "items": [...] } },
    { "type": "footer", "order": N, "content": { "companyName": "...", "address": "..." } }
  ],
  "metadata": { "channel": "email", "tone": "...", "audience": "..." },
  "artDirection": { "mood": "...", "imageStyle": "..." }
}

Section types: hero, value_prop, testimonial, social_proof, text_block, image, cta, divider, footer.
CTA variants: pill (rounded), ghost (outlined), fullWidth.
Icons: Zap, Shield, Users, Clock, Star, Heart, Target, Rocket, Globe, Lock.

Always include hero (first) and footer (last). Choose 2-4 middle sections based on the content purpose.`;

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

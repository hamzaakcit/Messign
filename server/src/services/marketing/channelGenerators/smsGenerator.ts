/**
 * SMS Channel Generator
 *
 * Generates ultra-concise SMS copy from the hero content.
 * Must fit in 160 characters with a clear CTA.
 * Uses Groq (fast model) — SMS is the simplest format.
 */

import type { GeneratorInput, GeneratorOutput, LLMCallFunction, ChannelGenerator } from './types.js';

export const smsGenerator: ChannelGenerator = async (
  input: GeneratorInput,
  callLLM: LLMCallFunction,
): Promise<GeneratorOutput> => {
  const { heroContent, brandProfile } = input;

  const systemPrompt = `You are an SMS marketing copywriter.
Write an SMS message based on the provided content.

STRICT rules:
- Maximum 160 characters (including spaces and the CTA link placeholder)
- Include "[LINK]" as a placeholder for the shortened URL
- Clear, direct CTA (what should the reader do?)
- No emojis, no hashtags, no abbreviations that aren't universal
- The message must make sense on its own (no context from other channels)
- Include opt-out reminder: "Reply STOP to opt out" (count this in the 160 chars)

Output format — provide exactly 3 variants (best to worst), separated by ---:
Variant 1
---
Variant 2
---
Variant 3

Just the SMS text. No labels, no numbering, no explanations.${brandProfile ? `\nBrand: ${brandProfile.brand_name}. Keep it on-brand but ultra-concise.` : ''}`;

  const userMessage = `Write SMS copy for: ${heroContent.title}
Key message: ${heroContent.body.slice(0, 200)}`;

  const llmResponse = await callLLM({
    model: 'fast',
    systemPrompt,
    userMessage,
    maxTokens: 400,
  });

  const variants = parseSmsVariants(llmResponse);
  const bestVariant =
    variants[0] || `${heroContent.title.slice(0, 80)} [LINK] Reply STOP to opt out`;

  return {
    channel: 'sms',
    title: `SMS: ${heroContent.title}`,
    body: bestVariant,
    channelMetadata: {
      generator: 'batch-sms',
      char_count: bestVariant.length,
      within_limit: bestVariant.length <= 160,
      variant_count: variants.length,
      all_variants: variants,
      has_link_placeholder: bestVariant.includes('[LINK]'),
      has_opt_out: bestVariant.toLowerCase().includes('stop'),
    },
  };
};

function parseSmsVariants(response: string): string[] {
  return response
    .split(/\n---\n|\n-{3,}\n/)
    .map((v) => v.trim())
    .filter((v) => v.length > 10 && v.length <= 200)
    .slice(0, 3);
}

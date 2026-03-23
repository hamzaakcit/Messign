/**
 * LinkedIn Channel Generator
 *
 * Generates a professional LinkedIn post optimized for the algorithm:
 * 1000-1300 char sweet spot, hook-first, short paragraphs.
 * Uses Groq (fast model) — LinkedIn posts are text-focused.
 */

import type { GeneratorInput, GeneratorOutput, LLMCallFunction, ChannelGenerator } from './types.js';

export const linkedinGenerator: ChannelGenerator = async (
  input: GeneratorInput,
  callLLM: LLMCallFunction,
): Promise<GeneratorOutput> => {
  const { heroContent, brandProfile } = input;

  const systemPrompt = `You are a LinkedIn thought leadership content writer.
Write a compelling LinkedIn post based on the provided content.

Rules:
- Target 1000-1300 characters (sweet spot for LinkedIn algorithm engagement)
- First line is the HOOK — must grab attention (appears before "...see more")
- Use short paragraphs (1-2 sentences max) with line breaks between
- Include a personal insight or opinion (not just a restatement)
- End with a question to drive comments OR a clear CTA
- Do NOT use hashtags in the body (add 3-5 at the very end, separated by a blank line)
- Professional but human tone — avoid corporate jargon
- Use arrow bullet points for lists (not dashes or numbers)

Output the post text directly. No JSON, no labels, no metadata. Just the post.${brandProfile ? `\n\nBrand voice: ${brandProfile.tone_keywords.join(', ')}. Writing style: ${brandProfile.voice_examples.slice(0, 1).join('')}` : ''}`;

  const userMessage = `Write a LinkedIn post based on this content:

Title: ${heroContent.title}
Key message: ${heroContent.body.slice(0, 600)}

Make it feel like a genuine thought from a founder/leader, not a corporate announcement.`;

  const llmResponse = await callLLM({
    model: 'fast',
    systemPrompt,
    userMessage,
    maxTokens: 600,
  });

  const postText = llmResponse.trim();

  return {
    channel: 'linkedin',
    title: `LinkedIn: ${heroContent.title}`,
    body: postText,
    channelMetadata: {
      generator: 'batch-linkedin',
      char_count: postText.length,
      within_sweet_spot: postText.length >= 800 && postText.length <= 1500,
      has_hashtags: postText.includes('#'),
      line_count: postText.split('\n').filter((l) => l.trim()).length,
    },
  };
};

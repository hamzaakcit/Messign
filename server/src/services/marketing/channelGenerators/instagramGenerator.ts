/**
 * Instagram Channel Generator
 *
 * Generates a carousel post: main caption + 4-6 slide texts + image prompts.
 * Uses Claude (creative model) for rich visual storytelling,
 * carousel narrative arcs, and per-slide image prompt generation.
 */

import type { GeneratorInput, GeneratorOutput, LLMCallFunction, ChannelGenerator } from './types.js';

export const instagramGenerator: ChannelGenerator = async (
  input: GeneratorInput,
  callLLM: LLMCallFunction,
): Promise<GeneratorOutput> => {
  const { heroContent, brandProfile } = input;

  const systemPrompt = `You are an Instagram content strategist specializing in carousel posts.
Create a carousel post (4-6 slides) from the provided content.

Output format (valid JSON in \`\`\`json fences):
{
  "caption": "Main post caption (max 2200 chars). Include hashtags at the end (5-10 relevant tags).",
  "slides": [
    {
      "slide_number": 1,
      "text": "Slide headline / hook (max 100 chars, this goes ON the slide image)",
      "subtext": "Supporting text for the slide (max 150 chars)",
      "image_prompt": "Describe the visual for AI image generation"
    }
  ]
}

Carousel structure:
- Slide 1: Hook / attention grabber (bold statement or question)
- Slides 2-4: Key points / value / process steps
- Slide 5 (optional): Social proof or data point
- Last slide: CTA ("Save this post", "Follow for more", "Link in bio")

Caption rules:
- Opening line is the hook (appears before "...more")
- Use line breaks for readability
- End with 5-10 hashtags on the last line
- Include a CTA ("Save this for later", "Share with your team")${brandProfile ? `\n\nBrand: ${brandProfile.brand_name}. Voice: ${brandProfile.tone_keywords.join(', ')}.` : ''}`;

  const userMessage = `Create an Instagram carousel post for this content:

Title: ${heroContent.title}
Content: ${heroContent.body.slice(0, 800)}`;

  const llmResponse = await callLLM({
    model: 'creative',
    systemPrompt,
    userMessage,
    maxTokens: 1500,
  });

  const parsed = parseInstagramOutput(llmResponse);

  return {
    channel: 'instagram',
    title: `Instagram: ${heroContent.title}`,
    body: parsed.caption,
    channelMetadata: {
      generator: 'batch-instagram',
      slide_count: parsed.slides.length,
      slides: parsed.slides,
      has_hashtags: parsed.caption.includes('#'),
    },
    imagePrompts: parsed.slides.map((s) => s.image_prompt).filter(Boolean),
  };
};

interface InstagramSlide {
  slide_number: number;
  text: string;
  subtext?: string;
  image_prompt: string;
}

function parseInstagramOutput(response: string): { caption: string; slides: InstagramSlide[] } {
  const jsonMatch = response.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1].replace(/,\s*([}\]])/g, '$1'));
      if (parsed.caption && Array.isArray(parsed.slides)) {
        return { caption: parsed.caption, slides: parsed.slides };
      }
    } catch {
      /* fall through to fallback */
    }
  }

  return {
    caption: response.trim(),
    slides: [{ slide_number: 1, text: 'Check this out', image_prompt: 'Engaging visual' }],
  };
}

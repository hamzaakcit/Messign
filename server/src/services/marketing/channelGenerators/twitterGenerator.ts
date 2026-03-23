/**
 * Twitter Channel Generator
 *
 * Generates 5 tweet variants from the hero content, each taking
 * a different angle on the same core message.
 * Uses Groq (fast model) — tweets are short and don't need complex reasoning.
 */

import type { GeneratorInput, GeneratorOutput, LLMCallFunction, ChannelGenerator } from './types.js';

export const twitterGenerator: ChannelGenerator = async (
  input: GeneratorInput,
  callLLM: LLMCallFunction,
): Promise<GeneratorOutput> => {
  const { heroContent, brandProfile } = input;

  const systemPrompt = `You are a social media expert specializing in Twitter/X.
Generate exactly 5 tweet variants based on the provided content.
Each tweet must be a DIFFERENT angle on the same core message.

Rules:
- Maximum 280 characters per tweet (STRICT — count carefully)
- Include 1-3 relevant hashtags per tweet (counted in the 280 limit)
- No emojis in the first tweet (professional). Emojis optional in others.
- Vary the approaches:
  1. Benefit-driven (what the reader gains)
  2. Problem-agitation (pain point → solution)
  3. Social proof / number-driven ("Join 10K+ teams...")
  4. Question-based (engage curiosity)
  5. Bold statement / hot take

Output format — exactly 5 tweets, each on its own line, separated by ---:
Tweet 1 text here
---
Tweet 2 text here
---
Tweet 3 text here
---
Tweet 4 text here
---
Tweet 5 text here

Do NOT include numbering, labels, or explanations. Just the tweet text.${brandProfile ? `\n\nBrand voice: ${brandProfile.tone_keywords.join(', ')}. Avoid: ${brandProfile.forbidden_words.join(', ')}.` : ''}`;

  const userMessage = `Create 5 tweet variants for this content:

Title: ${heroContent.title}
Key message: ${heroContent.body.slice(0, 500)}`;

  const llmResponse = await callLLM({
    model: 'fast',
    systemPrompt,
    userMessage,
    maxTokens: 800,
  });

  const tweets = parseTweets(llmResponse);

  return {
    channel: 'twitter',
    title: `Tweets: ${heroContent.title}`,
    body: tweets.join('\n\n---\n\n'),
    channelMetadata: {
      generator: 'batch-twitter',
      tweet_count: tweets.length,
      tweets,
      longest_tweet: Math.max(...tweets.map((t) => t.length)),
      all_within_limit: tweets.every((t) => t.length <= 280),
    },
  };
};

function parseTweets(response: string): string[] {
  const tweets = response
    .split(/\n---\n|\n-{3,}\n/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && t.length <= 300);

  if (tweets.length < 3) {
    const lines = response
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 20 && !l.startsWith('Tweet') && !l.match(/^\d+[.)]/));
    if (lines.length >= 3) return lines.slice(0, 5);
  }

  return tweets.slice(0, 5);
}

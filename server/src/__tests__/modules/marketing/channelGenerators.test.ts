import { describe, it, expect, vi } from 'vitest';
import type {
  GeneratorInput,
  LLMCallFunction,
} from '../../../services/marketing/channelGenerators/types.js';
import {
  getChannelGenerator,
  getRegisteredChannels,
} from '../../../services/marketing/channelGenerators/registry.js';

// ── Mock LLM that returns predictable, channel-appropriate responses ──

const mockLLMResponses: Record<string, string> = {
  email:
    '```json\n{"version":"2.0","theme":"startup","subject":"Test Launch","preheader":"Preview text that is long enough for email clients.","sections":[{"type":"hero","order":1,"content":{"headline":"Test"}},{"type":"footer","order":2,"content":{"companyName":"X","address":"A"}}],"metadata":{"channel":"email","tone":"pro","audience":"all"}}\n```',
  twitter:
    "Check out our latest feature — it changes everything.\n---\nWe just shipped something big. Here's why it matters.\n---\nJoin 2,400+ teams already using this. You're missing out.\n---\nWhat if you could save 12 hours every week? Now you can.\n---\nThe future of workflows is here. No, seriously. #ai #productivity",
  instagram:
    '```json\n{"caption":"Big launch today. We built the thing.\\n\\n#ai #workflows","slides":[{"slide_number":1,"text":"The future of work","subtext":"Is here","image_prompt":"Modern workspace"},{"slide_number":2,"text":"12 hours saved","subtext":"Every week","image_prompt":"Clock with checkmarks"}]}\n```',
  linkedin:
    "I've been thinking a lot about how we work.\n\nMost teams spend 12+ hours a week on tasks that should be automated.\n\nThat's 600+ hours a year. Per person.\n\nWe built something to fix that.\n\n→ Set up workflows in 2 minutes\n→ Zero coding required\n→ SOC2 compliant\n\nWhat's the most tedious part of your workflow?\n\n#ai #productivity #saas",
  sms: 'Save 12hrs/wk with AI workflows. Try free: [LINK] Reply STOP to opt out\n---\nNew: automate your deploys in 2min. Free trial: [LINK] Reply STOP to opt out\n---\nYour team deserves better. Try AI workflows: [LINK] Reply STOP to opt out',
};

function createMockLLM(): LLMCallFunction {
  return vi.fn(async (params) => {
    if (
      params.systemPrompt.includes('email') ||
      params.systemPrompt.includes('Design Manifest')
    ) {
      return mockLLMResponses.email;
    }
    if (
      params.systemPrompt.includes('Twitter') ||
      params.systemPrompt.includes('tweet')
    ) {
      return mockLLMResponses.twitter;
    }
    if (
      params.systemPrompt.includes('Instagram') ||
      params.systemPrompt.includes('carousel')
    ) {
      return mockLLMResponses.instagram;
    }
    if (params.systemPrompt.includes('LinkedIn')) {
      return mockLLMResponses.linkedin;
    }
    if (params.systemPrompt.includes('SMS')) {
      return mockLLMResponses.sms;
    }
    return 'Fallback response';
  });
}

function createTestInput(
  overrides?: Partial<GeneratorInput>,
): GeneratorInput {
  return {
    heroContent: {
      id: 'hero-123',
      title: 'Introducing AI Workflows',
      body: 'We are launching AI-powered workflows that automate repetitive tasks. Teams save 12 hours per week on average. Set up in 2 minutes, no coding required. SOC2 compliant.',
      channel: 'email',
      metadata: {},
      organization_id: 'org-456',
    },
    organizationId: 'org-456',
    userId: 'user-789',
    ...overrides,
  };
}

// ══════════════════════════════════════

describe('Channel Generator Registry', () => {
  it('has all 5 channels registered', () => {
    const channels = getRegisteredChannels();
    expect(channels).toContain('email');
    expect(channels).toContain('twitter');
    expect(channels).toContain('instagram');
    expect(channels).toContain('linkedin');
    expect(channels).toContain('sms');
    expect(channels).toHaveLength(5);
  });

  it('returns undefined for unknown channel', () => {
    expect(getChannelGenerator('tiktok')).toBeUndefined();
  });

  it('returns a function for each registered channel', () => {
    for (const channel of getRegisteredChannels()) {
      const gen = getChannelGenerator(channel);
      expect(typeof gen).toBe('function');
    }
  });
});

describe('Email Generator', () => {
  it('produces GeneratorOutput with email channel', async () => {
    const gen = getChannelGenerator('email')!;
    const output = await gen(createTestInput(), createMockLLM());
    expect(output.channel).toBe('email');
    expect(output.title).toBeTruthy();
    expect(output.body).toBeTruthy();
  });

  it('extracts design manifest from LLM response', async () => {
    const gen = getChannelGenerator('email')!;
    const output = await gen(createTestInput(), createMockLLM());
    expect(output.designManifest).toBeDefined();
    expect(output.channelMetadata.has_manifest).toBe(true);
  });

  it('uses creative model (Claude)', async () => {
    const mockLLM = createMockLLM();
    const gen = getChannelGenerator('email')!;
    await gen(createTestInput(), mockLLM);
    expect(mockLLM).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'creative' }),
    );
  });
});

describe('Twitter Generator', () => {
  it('produces multiple tweets', async () => {
    const gen = getChannelGenerator('twitter')!;
    const output = await gen(createTestInput(), createMockLLM());
    expect(output.channel).toBe('twitter');
    const tweets = output.channelMetadata.tweets as string[];
    expect(tweets.length).toBeGreaterThanOrEqual(3);
  });

  it('tweets metadata includes count and length checks', async () => {
    const gen = getChannelGenerator('twitter')!;
    const output = await gen(createTestInput(), createMockLLM());
    expect(output.channelMetadata.tweet_count).toBeGreaterThan(0);
    expect(typeof output.channelMetadata.longest_tweet).toBe('number');
    expect(typeof output.channelMetadata.all_within_limit).toBe('boolean');
  });

  it('uses fast model (Groq)', async () => {
    const mockLLM = createMockLLM();
    const gen = getChannelGenerator('twitter')!;
    await gen(createTestInput(), mockLLM);
    expect(mockLLM).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'fast' }),
    );
  });
});

describe('Instagram Generator', () => {
  it('produces caption and slides', async () => {
    const gen = getChannelGenerator('instagram')!;
    const output = await gen(createTestInput(), createMockLLM());
    expect(output.channel).toBe('instagram');
    expect(output.body).toBeTruthy();
    const slides = output.channelMetadata.slides as unknown[];
    expect(slides.length).toBeGreaterThanOrEqual(1);
  });

  it('includes image prompts for slides', async () => {
    const gen = getChannelGenerator('instagram')!;
    const output = await gen(createTestInput(), createMockLLM());
    expect(output.imagePrompts).toBeDefined();
    expect(output.imagePrompts!.length).toBeGreaterThan(0);
  });

  it('uses creative model (Claude)', async () => {
    const mockLLM = createMockLLM();
    const gen = getChannelGenerator('instagram')!;
    await gen(createTestInput(), mockLLM);
    expect(mockLLM).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'creative' }),
    );
  });
});

describe('LinkedIn Generator', () => {
  it('produces a post with non-trivial length', async () => {
    const gen = getChannelGenerator('linkedin')!;
    const output = await gen(createTestInput(), createMockLLM());
    expect(output.channel).toBe('linkedin');
    expect(output.body.length).toBeGreaterThan(100);
    expect(output.channelMetadata.char_count).toBeGreaterThan(0);
  });

  it('metadata tracks character count and hashtags', async () => {
    const gen = getChannelGenerator('linkedin')!;
    const output = await gen(createTestInput(), createMockLLM());
    expect(typeof output.channelMetadata.char_count).toBe('number');
    expect(typeof output.channelMetadata.has_hashtags).toBe('boolean');
    expect(typeof output.channelMetadata.line_count).toBe('number');
  });

  it('uses fast model (Groq)', async () => {
    const mockLLM = createMockLLM();
    const gen = getChannelGenerator('linkedin')!;
    await gen(createTestInput(), mockLLM);
    expect(mockLLM).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'fast' }),
    );
  });
});

describe('SMS Generator', () => {
  it('produces concise SMS copy', async () => {
    const gen = getChannelGenerator('sms')!;
    const output = await gen(createTestInput(), createMockLLM());
    expect(output.channel).toBe('sms');
    expect(output.body.length).toBeLessThan(200);
  });

  it('metadata includes variants and compliance checks', async () => {
    const gen = getChannelGenerator('sms')!;
    const output = await gen(createTestInput(), createMockLLM());
    expect(output.channelMetadata.variant_count).toBeGreaterThan(0);
    expect(typeof output.channelMetadata.has_link_placeholder).toBe('boolean');
    expect(typeof output.channelMetadata.has_opt_out).toBe('boolean');
  });

  it('uses fast model (Groq)', async () => {
    const mockLLM = createMockLLM();
    const gen = getChannelGenerator('sms')!;
    await gen(createTestInput(), mockLLM);
    expect(mockLLM).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'fast' }),
    );
  });
});

describe('All Generators — Brand Profile', () => {
  it('all generators accept brand profile without error', async () => {
    const input = createTestInput({
      brandProfile: {
        brand_name: 'Messign',
        tone_keywords: ['confident', 'technical', 'approachable'],
        forbidden_words: ['synergy', 'leverage', 'disrupt'],
        voice_examples: ['We ship tools that work. No fluff.'],
        style_guide_notes: 'Always lead with the benefit, not the feature.',
      },
    });

    for (const channel of getRegisteredChannels()) {
      const gen = getChannelGenerator(channel)!;
      const output = await gen(input, createMockLLM());
      expect(output.channel).toBe(channel);
      expect(output.body).toBeTruthy();
    }
  });

  it('all generators work without brand profile', async () => {
    const input = createTestInput({ brandProfile: null });
    for (const channel of getRegisteredChannels()) {
      const gen = getChannelGenerator(channel)!;
      const output = await gen(input, createMockLLM());
      expect(output.channel).toBe(channel);
    }
  });
});

describe('All Generators — Error Handling', () => {
  it('generators propagate LLM errors', async () => {
    const failingLLM: LLMCallFunction = async () => {
      throw new Error('LLM unavailable');
    };

    for (const channel of getRegisteredChannels()) {
      const gen = getChannelGenerator(channel)!;
      await expect(gen(createTestInput(), failingLLM)).rejects.toThrow(
        'LLM unavailable',
      );
    }
  });
});

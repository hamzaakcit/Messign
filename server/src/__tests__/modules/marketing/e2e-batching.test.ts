import { describe, it, expect, vi } from 'vitest';
import {
  isValidChannel,
  VALID_BATCH_CHANNELS,
  computeOverallStatus,
} from '../../../services/marketing/batchService.js';
import {
  getChannelGenerator,
  getRegisteredChannels,
} from '../../../services/marketing/channelGenerators/registry.js';
import type {
  GeneratorInput,
  GeneratorOutput,
  LLMCallFunction,
} from '../../../services/marketing/channelGenerators/types.js';

function createHeroContent(): GeneratorInput['heroContent'] {
  return {
    id: 'hero-e2e-001',
    title: 'Messign Workflows: Ship 10x Faster with AI',
    body: "We're launching AI-powered workflows that automate repetitive tasks. Teams save 12 hours per week. Set up in 2 minutes, no coding. SOC2 compliant. Join 2,400+ teams.",
    channel: 'email',
    metadata: {},
    organization_id: 'org-e2e-001',
  };
}

function createBrandProfile(): GeneratorInput['brandProfile'] {
  return {
    brand_name: 'Messign',
    tone_keywords: ['confident', 'technical', 'approachable'],
    forbidden_words: ['synergy', 'leverage', 'disrupt'],
    voice_examples: ['We ship tools that work. No fluff.'],
    style_guide_notes: 'Lead with benefit, use specific numbers.',
  };
}

function createMockLLM(): LLMCallFunction {
  return vi.fn(async (params) => {
    if (
      params.systemPrompt.includes('Design Manifest') ||
      params.systemPrompt.includes('email marketing')
    ) {
      return '```json\n{"version":"2.0","theme":"startup","subject":"Ship 10x Faster","preheader":"Your team deserves better than manual deploys.","sections":[{"type":"hero","order":1,"content":{"headline":"Ship 10x Faster","ctaText":"Try Free","ctaUrl":"#"}},{"type":"footer","order":2,"content":{"companyName":"Messign","address":"SF CA"}}],"metadata":{"channel":"email","tone":"confident","audience":"devs"}}\n```';
    }
    if (
      params.systemPrompt.includes('Twitter') ||
      params.systemPrompt.includes('tweet')
    ) {
      return 'Your team wastes 12hrs/week on tasks AI can handle. #devtools\n---\nWe shipped AI Workflows. 2min setup, no code. #messign\n---\n2,400+ teams ship 10x faster with Messign. #productivity\n---\nWhat if deploys took 15min instead of 3hrs? #engineering\n---\nHot take: manual deploys in 2026 are leaving money on the table.';
    }
    if (
      params.systemPrompt.includes('Instagram') ||
      params.systemPrompt.includes('carousel')
    ) {
      return '```json\n{"caption":"We shipped something big.\\n\\n#ai #workflows","slides":[{"slide_number":1,"text":"12hrs wasted weekly","subtext":"On tasks AI handles","image_prompt":"Frustrated dev"},{"slide_number":2,"text":"Meet Messign Workflows","subtext":"2min setup","image_prompt":"Clean dashboard"}]}\n```';
    }
    if (params.systemPrompt.includes('LinkedIn')) {
      return "Most teams waste 12+ hours weekly on repetitive tasks.\n\nThat's 600+ hours/year per person.\n\nWe built Messign Workflows:\n\n→ 2-minute setup\n→ SOC2 compliant\n→ 2,400+ teams\n\nWhat's your most tedious workflow?\n\n#engineering #ai";
    }
    if (params.systemPrompt.includes('SMS')) {
      return 'Ship 10x faster with AI workflows. Free trial: [LINK] Reply STOP to opt out\n---\nAutomate deploys in 2min. No code: [LINK] Reply STOP to opt out\n---\n2400+ teams ship faster. Join them: [LINK] Reply STOP to opt out';
    }
    return 'Fallback';
  });
}

function makeInput(
  overrides?: Partial<GeneratorInput>,
): GeneratorInput {
  return {
    heroContent: createHeroContent(),
    brandProfile: null,
    organizationId: 'org-e2e-001',
    userId: 'u-e2e-001',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

describe('E2E: Full 5-Channel Generation Pipeline', () => {
  it('all channels generate successfully from same hero', async () => {
    const llm = createMockLLM();
    const results: GeneratorOutput[] = [];

    for (const channel of getRegisteredChannels()) {
      const gen = getChannelGenerator(channel)!;
      const output = await gen(
        makeInput({ brandProfile: createBrandProfile() }),
        llm,
      );
      results.push(output);
      expect(output.channel).toBe(channel);
      expect(output.title).toBeTruthy();
      expect(output.body.length).toBeGreaterThan(10);
    }
    expect(results).toHaveLength(5);
  });

  it('all channels work without brand profile', async () => {
    const llm = createMockLLM();
    for (const ch of getRegisteredChannels()) {
      const gen = getChannelGenerator(ch)!;
      const out = await gen(makeInput(), llm);
      expect(out.body).toBeTruthy();
    }
  });

  it('all channels propagate LLM errors', async () => {
    const fail: LLMCallFunction = async () => {
      throw new Error('gateway timeout');
    };
    for (const ch of getRegisteredChannels()) {
      const gen = getChannelGenerator(ch)!;
      await expect(gen(makeInput(), fail)).rejects.toThrow('gateway timeout');
    }
  });
});

describe('E2E: Email → VA2 Compatibility', () => {
  it('email output contains parseable Design Manifest', async () => {
    const gen = getChannelGenerator('email')!;
    const out = await gen(makeInput(), createMockLLM());
    expect(out.designManifest).toBeDefined();
    expect(out.designManifest!.version).toBe('2.0');
    expect(Array.isArray(out.designManifest!.sections)).toBe(true);
  });
});

describe('E2E: Twitter Quality', () => {
  it('produces unique non-duplicate tweets', async () => {
    const gen = getChannelGenerator('twitter')!;
    const out = await gen(makeInput(), createMockLLM());
    const tweets = out.channelMetadata.tweets as string[];
    expect(tweets.length).toBeGreaterThanOrEqual(3);
    expect(new Set(tweets).size).toBe(tweets.length);
  });
});

describe('E2E: Instagram Structure', () => {
  it('produces slides with image prompts', async () => {
    const gen = getChannelGenerator('instagram')!;
    const out = await gen(makeInput(), createMockLLM());
    const slides = out.channelMetadata.slides as Array<{
      text: string;
      image_prompt: string;
    }>;
    expect(slides.length).toBeGreaterThanOrEqual(2);
    for (const s of slides) {
      expect(s.text).toBeTruthy();
      expect(s.image_prompt).toBeTruthy();
    }
    expect(out.imagePrompts!.length).toBe(slides.length);
  });
});

describe('E2E: SMS Compliance', () => {
  it('contains link placeholder and opt-out', async () => {
    const gen = getChannelGenerator('sms')!;
    const out = await gen(makeInput(), createMockLLM());
    expect(out.body).toContain('[LINK]');
    expect(out.body.toLowerCase()).toContain('stop');
  });
});

describe('E2E: LLM Model Routing', () => {
  const modelTests: [string, 'fast' | 'creative'][] = [
    ['email', 'creative'],
    ['instagram', 'creative'],
    ['twitter', 'fast'],
    ['linkedin', 'fast'],
    ['sms', 'fast'],
  ];

  it.each(modelTests)('%s uses %s model', async (channel, expectedModel) => {
    const llm = createMockLLM();
    const gen = getChannelGenerator(channel)!;
    await gen(makeInput(), llm);
    expect(llm).toHaveBeenCalledWith(
      expect.objectContaining({ model: expectedModel }),
    );
  });
});

describe('E2E: Channel + Service Sync', () => {
  it('generator channels match batch service channels', () => {
    const genChannels = new Set(getRegisteredChannels());
    for (const ch of VALID_BATCH_CHANNELS) {
      expect(genChannels.has(ch)).toBe(true);
    }
  });

  it('isValidChannel accepts all registered channels', () => {
    for (const ch of getRegisteredChannels()) {
      expect(isValidChannel(ch)).toBe(true);
    }
    expect(isValidChannel('fax')).toBe(false);
  });

  it('status computation covers all terminal combos', () => {
    expect(
      computeOverallStatus(
        [
          { channel: 'a', content_id: 'c1', status: 'completed' },
          { channel: 'b', content_id: 'c2', status: 'completed' },
        ],
        2,
        'processing',
      ),
    ).toBe('completed');

    expect(
      computeOverallStatus(
        [{ channel: 'a', content_id: null, status: 'failed', error: 'x' }],
        1,
        'processing',
      ),
    ).toBe('failed');

    expect(
      computeOverallStatus(
        [
          { channel: 'a', content_id: 'c1', status: 'completed' },
          { channel: 'b', content_id: null, status: 'failed', error: 'x' },
        ],
        2,
        'processing',
      ),
    ).toBe('partial');

    expect(
      computeOverallStatus(
        [{ channel: 'a', content_id: null, status: 'processing' }],
        1,
        'processing',
      ),
    ).toBe('processing');

    expect(
      computeOverallStatus(
        [{ channel: 'a', content_id: null, status: 'processing' }],
        1,
        'cancelled',
      ),
    ).toBe('cancelled');
  });
});

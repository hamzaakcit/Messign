/**
 * Shared types for channel generators.
 * Each generator receives a GeneratorInput and returns a GeneratorOutput.
 * The LLM call function is injected for testability.
 */

/** What every channel generator receives. */
export interface GeneratorInput {
  heroContent: {
    id: string;
    title: string;
    body: string;
    channel: string;
    metadata: Record<string, unknown>;
    organization_id: string;
  };
  brandProfile?: {
    brand_name: string;
    tone_keywords: string[];
    forbidden_words: string[];
    voice_examples: string[];
    style_guide_notes?: string;
  } | null;
  organizationId: string;
  userId: string;
}

/** What every channel generator returns. */
export interface GeneratorOutput {
  channel: string;
  title: string;
  body: string;
  channelMetadata: Record<string, unknown>;
  imagePrompts?: string[];
  designManifest?: Record<string, unknown>;
}

/** Generator function signature. */
export type ChannelGenerator = (
  input: GeneratorInput,
  callLLM: LLMCallFunction,
) => Promise<GeneratorOutput>;

/** Injected LLM call function — maps to generateResponse from llmGateway. */
export type LLMCallFunction = (params: {
  model: 'fast' | 'creative';
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
}) => Promise<string>;

/**
 * Channel Generator Registry
 * Maps channel names to their generator functions.
 */

import type { ChannelGenerator } from './types.js';
import { emailGenerator } from './emailGenerator.js';
import { twitterGenerator } from './twitterGenerator.js';
import { instagramGenerator } from './instagramGenerator.js';
import { linkedinGenerator } from './linkedinGenerator.js';
import { smsGenerator } from './smsGenerator.js';

const GENERATOR_REGISTRY: Record<string, ChannelGenerator> = {
  email: emailGenerator,
  twitter: twitterGenerator,
  instagram: instagramGenerator,
  linkedin: linkedinGenerator,
  sms: smsGenerator,
};

/** Get the generator for a specific channel. Returns undefined for unknown channels. */
export function getChannelGenerator(channel: string): ChannelGenerator | undefined {
  return GENERATOR_REGISTRY[channel];
}

/** Get all registered channel names. */
export function getRegisteredChannels(): string[] {
  return Object.keys(GENERATOR_REGISTRY);
}

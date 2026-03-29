import { describe, expect, it } from 'vitest';
import {
  buildLucyOrchestratorPrompt,
  getLucyContextualBehavior,
  LUCY_SPECIALIST_PREAMBLE,
  resolveLucyContextKey,
  wrapSpecialistSystemPromptWithLucy,
} from '../../../modules/marketing/prompts/lucyPersona.js';

describe('lucyPersona', () => {
  it('LUCY_SPECIALIST_PREAMBLE embeds global topic fidelity for all marketing modes', () => {
    expect(LUCY_SPECIALIST_PREAMBLE).toContain('Topic fidelity');
    expect(LUCY_SPECIALIST_PREAMBLE).toContain("The user's brief wins");
  });

  it('buildLucyOrchestratorPrompt prepends identity', () => {
    const out = buildLucyOrchestratorPrompt('BASE');
    expect(out.startsWith('## IDENTITY')).toBe(true);
    expect(out.includes('\n\n---\n\nBASE')).toBe(true);
  });

  it('getLucyContextualBehavior(email) returns non-empty block', () => {
    const b = getLucyContextualBehavior('email');
    expect(b.length).toBeGreaterThan(80);
    expect(b).toContain('Email');
    expect(b).toContain('Visual Architect');
    expect(b).toContain('motionOverlay');
    expect(b).toContain('easterEgg');
  });

  it('resolveLucyContextKey maps campaign manager to campaign', () => {
    expect(
      resolveLucyContextKey({
        route: 'CAMPAIGN_MANAGER',
        channelInferred: 'linkedin',
        query: 'x',
      }),
    ).toBe('campaign');
  });

  it('resolveLucyContextKey maps both-then-content by channel', () => {
    expect(
      resolveLucyContextKey({
        route: 'BOTH_CAMPAIGN_THEN_CONTENT',
        channelInferred: 'email',
        query: 'launch',
      }),
    ).toBe('email');
  });

  it('wrapSpecialistSystemPromptWithLucy includes preamble and contextual block when enabled', async () => {
    const { isLucyPersonaEnabled } = await import('../../../modules/marketing/prompts/lucyEnabled.js');
    if (!isLucyPersonaEnabled()) {
      expect(wrapSpecialistSystemPromptWithLucy('BASE', {
        route: 'CONTENT_STRATEGIST',
        channelInferred: 'email',
        query: 'draft',
      })).toBe('BASE');
      return;
    }
    const wrapped = wrapSpecialistSystemPromptWithLucy('BASE_PROMPT', {
      route: 'CONTENT_STRATEGIST',
      channelInferred: 'email',
      query: 'draft',
    });
    expect(wrapped).toContain('PERSONA CONTEXT');
    expect(wrapped).toContain('BASE_PROMPT');
    expect(wrapped).toContain('CONTEXTUAL MODE: Email');
    expect(wrapped).toContain('Topic fidelity');
  });
});

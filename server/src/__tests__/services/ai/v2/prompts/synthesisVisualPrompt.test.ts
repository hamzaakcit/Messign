import { describe, expect, it } from 'vitest';
import {
  assemblePrompt,
  buildSynthesisPrompt,
  buildSynthesisVisualPrompt,
} from '../../../../../services/ai/v2/prompts/assemble.js';
import type { DoraContext } from '../../../../../services/ai/v2/types.js';

const minimalCtx: DoraContext = {
  organizationId: 'org-1',
  organizationSlug: 'acme',
  userId: 'u1',
  userName: 'Test',
  userRole: 'employee',
  sessionId: 's1',
  pagePath: '/dora',
  mode: 'ask',
  concise: false,
  today: '2025-03-25',
  timezone: 'UTC',
  doraRequest: {
    user: {
      userId: 'u1',
      userName: 'Test',
      userRole: 'employee',
      organizationId: 'org-1',
      department: 'Eng',
      teamId: null,
      knowledgeRole: null,
      level: '1',
      mpPoints: 0,
    },
    page: {
      currentPath: '/dora',
      currentModule: 'dora',
    },
    timestamp: '',
    todayDate: '2025-03-25',
    conciseMode: false,
  },
};

describe('synthesis_visual prompt', () => {
  it('uses widget visual output and supplement guardrails, not streaming number mandate', () => {
    const [msg] = assemblePrompt(buildSynthesisVisualPrompt(minimalCtx), minimalCtx);
    const content = typeof msg.content === 'string' ? msg.content : '';
    expect(content).toContain('Visual-widgets mode');
    expect(content).toContain('WIDGET SUPPLEMENT RULES');
    expect(content).toContain('Omitting numbers in prose is correct');
    expect(content).not.toContain('every number, amount, and metric you state MUST come directly');
    expect(content).not.toContain(
      'Every number you present (dollar amounts, counts, percentages, dates) MUST come verbatim',
    );
  });

  it('default synthesis still uses streaming numeric guardrails', () => {
    const [msg] = assemblePrompt(buildSynthesisPrompt(minimalCtx), minimalCtx);
    const content = typeof msg.content === 'string' ? msg.content : '';
    expect(content).toContain('every number, amount, and metric you state MUST come directly');
    expect(content).toContain('Every number you present (dollar amounts, counts, percentages, dates)');
  });
});

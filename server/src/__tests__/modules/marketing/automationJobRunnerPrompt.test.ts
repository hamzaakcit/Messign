import { describe, it, expect } from 'vitest';
import {
  buildMarketingAutomationJobRunnerPrompt,
  getMarketingAutomationJobRunnerSystemPrompt,
} from '../../../modules/marketing/prompts/marketingAutomationJobRunnerPrompt.js';

describe('marketingAutomationJobRunnerPrompt', () => {
  it('embeds job context and strict JSON instructions', () => {
    const p = buildMarketingAutomationJobRunnerPrompt({
      jobContext: JSON.stringify({ trigger_id: 't1', action_type: 'notify', action_config: {} }),
    });
    expect(p).toContain('STRICT MODE');
    expect(p).toContain('"status"');
    expect(p).toContain('needs_approval');
    expect(p).toContain('t1');
  });

  it('getMarketingAutomationJobRunnerSystemPrompt returns static spec', () => {
    const s = getMarketingAutomationJobRunnerSystemPrompt();
    expect(s).toContain('Marketing Automation Job Runner');
    expect(s).toContain('500');
  });
});

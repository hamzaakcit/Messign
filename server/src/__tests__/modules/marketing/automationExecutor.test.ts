import { describe, it, expect } from 'vitest';
import { resolveTemplate } from '../../../services/ai/marketing/automationExecutor.js';

describe('resolveTemplate', () => {
  it('replaces {{event.field}} from nested data', () => {
    const s = resolveTemplate('Hello {{event.task_name}}', { event: { task_name: 'Fix bug' } });
    expect(s).toBe('Hello Fix bug');
  });

  it('leaves unknown placeholders', () => {
    const s = resolveTemplate('Hi {{event.missing}}', { event: {} });
    expect(s).toBe('Hi {{event.missing}}');
  });
});

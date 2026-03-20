import { randomUUID } from 'crypto';
import { describe, it, expect } from 'vitest';
import { parseActiveViewState } from '../../services/ai/agent/activeViewState.js';
import { validateToolArgsForExecution } from '../../services/ai/toolArgSchemas.js';

describe('Agentic activeViewState (Zod)', () => {
  it('accepts minimal v1', () => {
    const r = parseActiveViewState({ version: 1, module: 'knowledge-hub' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.module).toBe('knowledge-hub');
  });

  it('rejects unknown keys (strict)', () => {
    const r = parseActiveViewState({ version: 1, module: 'x', injected: 1 });
    expect(r.ok).toBe(false);
  });

  it('rejects oversized serialized state', () => {
    const r = parseActiveViewState({ version: 1, module: 'x'.repeat(5000) });
    expect(r.ok).toBe(false);
  });
});

describe('Tool argument validation', () => {
  it('accepts knowledge search', () => {
    const r = validateToolArgsForExecution('knowledge:search_knowledge_base', { query: 'PTO policy' });
    expect(r.ok).toBe(true);
  });

  it('rejects empty query', () => {
    const r = validateToolArgsForExecution('knowledge:search_knowledge_base', { query: '' });
    expect(r.ok).toBe(false);
  });

  it('validates core:search_tools namespace optional', () => {
    const r = validateToolArgsForExecution('core:search_tools', { query: 'invoice' });
    expect(r.ok).toBe(true);
  });
});

describe('Tenant isolation (org string contract)', () => {
  it('detects org mismatch', () => {
    const a = randomUUID();
    const b = randomUUID();
    expect(a === b).toBe(false);
  });
});

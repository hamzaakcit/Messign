import { describe, it, expect } from 'vitest';
import { getToolChipDisplay } from '@/types/knowledge-hub/ai';

describe('getToolChipDisplay', () => {
  it('maps known marketing registry tools', () => {
    expect(getToolChipDisplay('marketing:product_truth_lookup').label).toBe('Product truth');
    expect(getToolChipDisplay('analytics:funnel_analysis').label).toBe('Funnel analysis');
  });

  it('title-cases unknown namespaced tools', () => {
    expect(getToolChipDisplay('custom:foo_bar_baz').label).toBe('Foo Bar Baz');
  });
});

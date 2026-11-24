import { describe, expect, it } from 'vitest';
import { contentSetupFor, readContentTenant, writeContentTenant } from '@/pages/marketing/lib/contentTenant';

describe('content tenant', () => {
  it('switches the drafting setup without leaving publish on', () => {
    writeContentTenant('bookstore');
    expect(readContentTenant()).toBe('bookstore');
    const setup = contentSetupFor('bookstore');
    expect(setup.brandName).toBe('Kitapyurdu');
    expect(setup.publishAllowed).toBe(false);
    expect(contentSetupFor('florist').brandName).toBe('Lilyana');
    writeContentTenant('messign');
  });
});
import { describe, expect, it } from 'vitest';
import { parseApiKeyArgs } from '../../scripts/engageApiKeyArgs.js';

const ORG = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';
const ID = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';

describe('engage:api-key arguments', () => {
  it('lists and revokes', () => {
    expect(parseApiKeyArgs(['list', '--org', ORG])).toEqual({ action: 'list', org: ORG });
    expect(parseApiKeyArgs(['revoke', '--org', ORG, '--id', ID])).toEqual({ action: 'revoke', org: ORG, id: ID });
  });
  it('refuses anything else', () => {
    expect(() => parseApiKeyArgs([])).toThrow(/list or revoke/);
    expect(() => parseApiKeyArgs(['delete', '--org', ORG])).toThrow(/list or revoke/);
    expect(() => parseApiKeyArgs(['list'])).toThrow(/--org/);
    expect(() => parseApiKeyArgs(['list', '--org', 'x'])).toThrow(/--org/);
    expect(() => parseApiKeyArgs(['list', '--org', ORG, '--id', ID])).toThrow(/does not take/);
    expect(() => parseApiKeyArgs(['revoke', '--org', ORG])).toThrow(/--id/);
    expect(() => parseApiKeyArgs(['revoke', '--org', ORG, '--id', 'nope'])).toThrow(/--id/);
    expect(() => parseApiKeyArgs(['revoke', '--org', ORG, '--org', ORG, '--id', ID])).toThrow(/twice/);
    expect(() => parseApiKeyArgs(['revoke', '--org', ORG, '--bogus', ID])).toThrow(/Unexpected/);
    expect(() => parseApiKeyArgs(['revoke', '--org', ORG, '--id'])).toThrow(/needs a value/);
  });
});

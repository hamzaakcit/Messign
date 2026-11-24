import { describe, expect, it } from 'vitest';
import { parseAllowlistArgs } from '../../scripts/engageAllowlistArgs.js';

const ORG = '3891052d-4a83-4b0e-a949-7b4a72672a47';
const ID = 'de2913ca-8c33-474d-8921-a93ad13dbd49';

describe('engage:allowlist arguments', () => {
  it('parses list, add (several values, a label) and remove', () => {
    expect(parseAllowlistArgs(['list', '--org', ORG])).toEqual({ action: 'list', org: ORG });
    expect(parseAllowlistArgs(['add', '--org', ORG, '--channel', 'email', '--value', 'a@example.com', '--value', 'b@example.com', '--label', 'staff']))
      .toEqual({ action: 'add', org: ORG, channel: 'email', values: ['a@example.com', 'b@example.com'], label: 'staff' });
    expect(parseAllowlistArgs(['remove', '--org', ORG, '--id', ID])).toEqual({ action: 'remove', org: ORG, id: ID });
  });
  it.each([
    [[], /list, add or remove/],
    [['list'], /--org/],
    [['list', '--org', 'x'], /--org/],
    [['add', '--org', ORG, '--channel', 'email'], /at least one --value/],
    [['add', '--org', ORG, '--channel', 'fax', '--value', 'x'], /--channel/],
    [['add', '--org', ORG, '--value', 'a@example.com'], /--channel/],
    [['remove', '--org', ORG], /--id/],
    [['add', '--org', ORG, '--org', ORG, '--channel', 'email', '--value', 'a@example.com'], /twice/],
    [['list', '--org', ORG, '--bogus', '1'], /Unknown option/],
    [['list', '--org', ORG, 'stray'], /Unexpected/],
    [['add', '--org', ORG, '--channel', 'email', '--value'], /needs a value/],
  ])('rejects %j', (argv, re) => { expect(() => parseAllowlistArgs(argv as string[])).toThrow(re); });
});

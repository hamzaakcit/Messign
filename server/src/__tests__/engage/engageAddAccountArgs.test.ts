import { describe, expect, it } from 'vitest';
import { configValue, parseAddAccountArgs } from '../../scripts/engageAddAccountArgs.js';

const ORG = '11111111-2222-4333-8444-555555555555';
const base = ['--org', ORG, '--channel', 'email', '--provider', 'ses', '--mode', 'test', '--label', 'SES sandbox'];

describe('engage:add-account arguments', () => {
  it('parses config values and secret names, and never takes secret values from arguments', () => {
    const a = parseAddAccountArgs([...base, '--config', 'region=eu-central-1', '--config', 'retries=3', '--config', 'verbose=true', '--secret', 'access_key_id', '--secret', 'secret_access_key']);
    expect(a).toMatchObject({ org: ORG, channel: 'email', provider: 'ses', mode: 'test', label: 'SES sandbox', createdBy: null });
    expect(a.config).toEqual({ region: 'eu-central-1', retries: 3, verbose: true });
    expect(a.secretNames).toEqual(['access_key_id', 'secret_access_key']);
  });

  it('keeps an equals sign inside a config value (an ARN, a URL)', () => {
    const a = parseAddAccountArgs([...base, '--config', 'sns_topic_arn=arn:aws:sns:eu-central-1:1:t', '--config', 'q=a=b', '--secret', 'k']);
    expect(a.config).toEqual({ sns_topic_arn: 'arn:aws:sns:eu-central-1:1:t', q: 'a=b' });
  });

  it.each([
    ['no secret names', [...base], /at least one --secret/],
    ['missing org', ['--channel', 'email', '--provider', 'ses', '--mode', 'test', '--label', 'x', '--secret', 'k'], /Missing --org/],
    ['org not a uuid', ['--org', 'abc', ...base.slice(2), '--secret', 'k'], /organization UUID/],
    ['created-by not a uuid', [...base, '--created-by', 'me', '--secret', 'k'], /user UUID/],
    ['unknown option', [...base, '--password', 'x', '--secret', 'k'], /Unknown option --password/],
    ['option without value', [...base, '--secret'], /needs a value/],
    ['bare argument', [...base, 'oops', '--secret', 'k'], /Unexpected argument/],
    ['config without equals', [...base, '--config', 'region', '--secret', 'k'], /name=value/],
    ['duplicate single option', [...base, '--label', 'again', '--secret', 'k'], /given twice/],
  ])('rejects %s', (_n, argv, message) => {
    expect(() => parseAddAccountArgs(argv)).toThrow(message);
  });

  it('keeps Meta ids as text: 16 or 17 digits would lose digits as a number', () => {
    expect(configValue('waba_id', '1234567890123456789')).toBe('1234567890123456789');
    expect(configValue('phone_number_id', '102290129340398')).toBe('102290129340398');
    expect(configValue('daily_recipient_limit', '2000')).toBe(2000);
    expect(configValue('big', '98765432109876543210')).toBe('98765432109876543210');
    expect(configValue('ratio', '0.5')).toBe(0.5);
  });

  it('--whatsapp sets the channel, the provider and the three secrets, and warns about missing ids', () => {
    const w = ['--org', ORG, '--whatsapp', '--mode', 'test', '--label', 'WA'];
    const a = parseAddAccountArgs([...w, '--config', 'phone_number_id=102290129340398']);
    expect(a).toMatchObject({ channel: 'whatsapp', provider: 'whatsapp_cloud', secretNames: ['access_token', 'app_secret', 'verify_token'] });
    expect(a.config).toEqual({ phone_number_id: '102290129340398' });
    expect(a.warnings).toEqual([expect.stringContaining('waba_id')]);
    const full = parseAddAccountArgs([...w, '--config', 'phone_number_id=1', '--config', 'waba_id=2', '--secret', 'access_token']);
    expect(full.warnings).toEqual([]);
    expect(full.secretNames).toEqual(['access_token']);
    expect(() => parseAddAccountArgs([...w, '--channel', 'email'])).toThrow(/--whatsapp sets --channel whatsapp/);
    expect(parseAddAccountArgs(base.concat('--secret', 'k')).warnings).toEqual([]);
  });
});

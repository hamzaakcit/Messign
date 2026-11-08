import { createHash, createHmac } from 'crypto';

/**
 * AWS Signature Version 4 for a single JSON request (no query string). Written out instead of pulling in the AWS SDK.
 * Reference: https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html
 * Checked against the published test vector "get-vanilla" (engageSesUnit.test.ts).
 */

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface SignInput {
  method: string;
  host: string;
  path: string;
  /** Extra headers to sign (lower-case names). host and x-amz-date are added. */
  headers: Record<string, string>;
  body: string;
  region: string;
  service: string;
  now: Date;
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const hmac = (key: Buffer | string, s: string) => createHmac('sha256', key).update(s, 'utf8').digest();

export function amzDate(now: Date): string {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

/** Returns the headers to send: the input headers plus host, x-amz-date, optional x-amz-security-token, authorization. */
export function signV4(input: SignInput, creds: AwsCredentials): Record<string, string> {
  const date = amzDate(input.now);
  const day = date.slice(0, 8);
  const headers: Record<string, string> = { ...input.headers, host: input.host, 'x-amz-date': date };
  if (creds.sessionToken) headers['x-amz-security-token'] = creds.sessionToken;
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort();
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v.trim().replace(/\s+/g, ' ');
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalPath = input.path.split('/').map((seg) => encodeURIComponent(seg)).join('/');
  const canonicalRequest = [input.method, canonicalPath, '', canonicalHeaders, signedHeaders, sha256(input.body)].join('\n');
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', date, scope, sha256(canonicalRequest)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${creds.secretAccessKey}`, day), input.region), input.service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

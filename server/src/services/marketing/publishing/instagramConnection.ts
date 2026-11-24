/**
 * Per-organization Instagram connection. The studio asks for the business account id
 * and a Graph token. Scheduled publish still follows SEND_MODE.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { withTenantQuery } from '../../../middleware/tenantContext.js';

const META_GRAPH_API_VERSION = 'v19.0';

export interface InstagramConnectionPublic {
  connected: boolean;
  accountId: string | null;
  username: string | null;
}

export interface InstagramCredentials {
  token: string;
  accountId: string;
  username: string | null;
}

/** Digits only. Instagram professional account ids are numeric. */
export function parseInstagramAccountId(value: string): string | null {
  const id = value.trim();
  if (!/^\d{5,32}$/.test(id)) return null;
  return id;
}

function encryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET?.trim() || process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error('Instagram credentials need JWT_SECRET on the server before they can be saved.');
  }
  return scryptSync(secret, 'messign-ig-connection', 32);
}

export function encryptInstagramToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptInstagramToken(payload: string): string {
  const [ivPart, tagPart, dataPart] = payload.split('.');
  if (!ivPart || !tagPart || !dataPart) throw new Error('Saved Instagram token is unreadable.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]);
  return plain.toString('utf8');
}

/** Confirms the token can see this Instagram professional account. */
export async function verifyInstagramCredentials(
  accountId: string,
  token: string,
): Promise<{ username: string | null }> {
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${accountId}`);
  url.searchParams.set('fields', 'id,username');
  url.searchParams.set('access_token', token);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
  const body = (await res.json().catch(() => ({}))) as {
    username?: string;
    error?: { message?: string };
  };
  if (!res.ok) {
    const message = body.error?.message?.replace(token, '') || `Instagram refused the connection (${res.status}).`;
    throw new Error(message);
  }
  return { username: body.username?.trim() || null };
}

export async function getInstagramConnection(organizationId: string): Promise<InstagramConnectionPublic> {
  const row = await withTenantQuery(organizationId, async (client) => {
    const result = await client.query<{ account_id: string; username: string | null }>(
      `SELECT account_id, username
       FROM marketing_instagram_connections
       WHERE organization_id = $1`,
      [organizationId],
    );
    return result.rows[0] ?? null;
  });
  if (!row) return { connected: false, accountId: null, username: null };
  return { connected: true, accountId: row.account_id, username: row.username };
}

export async function getInstagramCredentials(organizationId: string): Promise<InstagramCredentials | null> {
  const row = await withTenantQuery(organizationId, async (client) => {
    const result = await client.query<{ account_id: string; username: string | null; access_token_enc: string }>(
      `SELECT account_id, username, access_token_enc
       FROM marketing_instagram_connections
       WHERE organization_id = $1`,
      [organizationId],
    );
    return result.rows[0] ?? null;
  });
  if (!row) return null;
  return {
    accountId: row.account_id,
    username: row.username,
    token: decryptInstagramToken(row.access_token_enc),
  };
}

export async function saveInstagramConnection(
  organizationId: string,
  accountId: string,
  token: string,
  username: string | null,
): Promise<void> {
  const enc = encryptInstagramToken(token);
  await withTenantQuery(organizationId, async (client) => {
    await client.query(
      `INSERT INTO marketing_instagram_connections (organization_id, account_id, username, access_token_enc, updated_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (organization_id) DO UPDATE
         SET account_id = EXCLUDED.account_id,
             username = EXCLUDED.username,
             access_token_enc = EXCLUDED.access_token_enc,
             updated_at = now()`,
      [organizationId, accountId, username, enc],
    );
  });
}

export async function deleteInstagramConnection(organizationId: string): Promise<void> {
  await withTenantQuery(organizationId, async (client) => {
    await client.query(`DELETE FROM marketing_instagram_connections WHERE organization_id = $1`, [organizationId]);
  });
}

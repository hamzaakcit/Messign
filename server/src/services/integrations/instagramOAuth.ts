/**
 * Instagram Graph API — OAuth 2.0 Service
 *
 * Flow (Facebook Login for Business):
 *   1. Redirect user to Facebook OAuth dialog
 *   2. Exchange code → short-lived user token
 *   3. Exchange short-lived → long-lived user token (60-day)
 *   4. Fetch Facebook Pages the user manages → get linked Instagram Business Account
 *   5. Store in social_accounts table
 *
 * Docs: https://developers.facebook.com/docs/instagram-api/getting-started
 */

import { query } from '../../db/index.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const META_APP_ID = process.env.META_APP_ID ?? '';
const META_APP_SECRET = process.env.META_APP_SECRET ?? '';
const META_REDIRECT_URI = process.env.META_REDIRECT_URI ?? 'http://localhost:3001/api/integrations/instagram/callback';
const META_GRAPH_VERSION = 'v19.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

// Scopes required for Instagram content publishing
const INSTAGRAM_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
].join(',');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstagramAccount {
  id: string;
  platform_user_id: string;
  platform_username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  access_token: string;
  token_expires_at: Date | null;
  scopes: string[];
  meta: Record<string, unknown>;
}

interface FbTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface FbPageAccount {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

interface FbPagesResponse {
  data: FbPageAccount[];
}

interface IgUserInfo {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
}

// ---------------------------------------------------------------------------
// OAuth URL builder
// ---------------------------------------------------------------------------

export function buildInstagramAuthUrl(state: string): string {
  if (!META_APP_ID) {
    throw new Error('META_APP_ID is not configured. Add it to your server .env file.');
  }

  const url = new URL('https://www.facebook.com/dialog/oauth');
  url.searchParams.set('client_id', META_APP_ID);
  url.searchParams.set('redirect_uri', META_REDIRECT_URI);
  url.searchParams.set('scope', INSTAGRAM_SCOPES);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  return url.toString();
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

/** Exchange short-lived authorization code → short-lived user access token */
async function exchangeCodeForToken(code: string): Promise<{ accessToken: string }> {
  const url = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set('client_id', META_APP_ID);
  url.searchParams.set('client_secret', META_APP_SECRET);
  url.searchParams.set('redirect_uri', META_REDIRECT_URI);
  url.searchParams.set('code', code);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  const data = (await res.json()) as FbTokenResponse & { error?: { message: string } };

  if (!res.ok || data.error) {
    throw new Error(`Meta token exchange failed: ${data.error?.message ?? res.statusText}`);
  }

  return { accessToken: data.access_token };
}

/** Exchange short-lived user token → long-lived user token (60 days) */
async function getLongLivedToken(shortToken: string): Promise<{ accessToken: string; expiresAt: Date }> {
  const url = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', META_APP_ID);
  url.searchParams.set('client_secret', META_APP_SECRET);
  url.searchParams.set('fb_exchange_token', shortToken);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  const data = (await res.json()) as FbTokenResponse & { error?: { message: string } };

  if (!res.ok || data.error) {
    throw new Error(`Meta long-lived token exchange failed: ${data.error?.message ?? res.statusText}`);
  }

  const expiresAt = new Date(Date.now() + (data.expires_in ?? 5_184_000) * 1_000); // default 60d
  return { accessToken: data.access_token, expiresAt };
}

// ---------------------------------------------------------------------------
// Account discovery
// ---------------------------------------------------------------------------

/** Find the Instagram Business Account ID linked to any FB Page the user manages */
async function getInstagramBusinessAccount(
  userToken: string,
): Promise<{ igAccountId: string; pageId: string; pageName: string; pageToken: string } | null> {
  const url = new URL(`${META_GRAPH_BASE}/me/accounts`);
  url.searchParams.set('fields', 'id,name,access_token,instagram_business_account');
  url.searchParams.set('access_token', userToken);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  const data = (await res.json()) as FbPagesResponse & { error?: { message: string } };

  if (!res.ok || data.error) {
    throw new Error(`Failed to fetch FB Pages: ${data.error?.message ?? res.statusText}`);
  }

  for (const page of data.data ?? []) {
    if (page.instagram_business_account?.id) {
      return {
        igAccountId: page.instagram_business_account.id,
        pageId: page.id,
        pageName: page.name,
        pageToken: page.access_token, // page tokens are long-lived and don't expire
      };
    }
  }

  return null;
}

/** Fetch Instagram user info for the business account */
async function getIgUserInfo(igAccountId: string, accessToken: string): Promise<IgUserInfo> {
  const url = new URL(`${META_GRAPH_BASE}/${igAccountId}`);
  url.searchParams.set('fields', 'id,username,name,profile_picture_url');
  url.searchParams.set('access_token', accessToken);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return { id: igAccountId };
  return (await res.json()) as IgUserInfo;
}

// ---------------------------------------------------------------------------
// Main: complete OAuth flow
// ---------------------------------------------------------------------------

export async function completeInstagramOAuth(
  code: string,
  organizationId: string,
  connectedBy: string,
): Promise<InstagramAccount> {
  // 1. Exchange code → short token
  const { accessToken: shortToken } = await exchangeCodeForToken(code);

  // 2. Upgrade to long-lived token
  const { accessToken: longToken, expiresAt } = await getLongLivedToken(shortToken);

  // 3. Find linked Instagram Business Account
  const linked = await getInstagramBusinessAccount(longToken);
  if (!linked) {
    throw new Error(
      'No Instagram Business Account found. Make sure your Facebook Page is linked to an Instagram Business or Creator account.',
    );
  }

  // 4. Fetch Instagram profile info
  const igUser = await getIgUserInfo(linked.igAccountId, longToken);

  // 5. Persist to DB (upsert — reconnecting replaces old token)
  await query(
    `INSERT INTO social_accounts
       (organization_id, platform, platform_user_id, platform_username, display_name,
        access_token, token_expires_at, scopes, meta, connected_by, is_active)
     VALUES ($1, 'instagram', $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
     ON CONFLICT (organization_id, platform, platform_user_id)
     DO UPDATE SET
       access_token      = EXCLUDED.access_token,
       token_expires_at  = EXCLUDED.token_expires_at,
       platform_username = EXCLUDED.platform_username,
       display_name      = EXCLUDED.display_name,
       scopes            = EXCLUDED.scopes,
       meta              = EXCLUDED.meta,
       connected_by      = EXCLUDED.connected_by,
       is_active         = TRUE,
       updated_at        = NOW()`,
    [
      organizationId,
      linked.igAccountId,
      igUser.username ?? null,
      igUser.name ?? linked.pageName,
      longToken,
      expiresAt,
      INSTAGRAM_SCOPES.split(','),
      JSON.stringify({
        fb_page_id: linked.pageId,
        fb_page_name: linked.pageName,
        profile_picture_url: igUser.profile_picture_url ?? null,
      }),
      connectedBy,
    ],
  );

  return {
    id: linked.igAccountId,
    platform_user_id: linked.igAccountId,
    platform_username: igUser.username ?? null,
    display_name: igUser.name ?? linked.pageName,
    avatar_url: igUser.profile_picture_url ?? null,
    access_token: longToken,
    token_expires_at: expiresAt,
    scopes: INSTAGRAM_SCOPES.split(','),
    meta: { fb_page_id: linked.pageId, fb_page_name: linked.pageName },
  };
}

// ---------------------------------------------------------------------------
// Token refresh (call this on a cron or before each publish)
// ---------------------------------------------------------------------------

/** Refresh a long-lived token before it expires (safe to call any time — Meta allows refresh after 24h) */
export async function refreshInstagramToken(
  organizationId: string,
  platformUserId: string,
): Promise<void> {
  const rows = await query<{ id: string; access_token: string }>(
    `SELECT id, access_token FROM social_accounts
     WHERE organization_id = $1 AND platform = 'instagram' AND platform_user_id = $2 AND is_active = TRUE`,
    [organizationId, platformUserId],
  );

  if (!rows.rows.length) throw new Error('Instagram account not found');
  const { id, access_token: currentToken } = rows.rows[0];

  const url = new URL(`${META_GRAPH_BASE}/refresh_access_token`);
  url.searchParams.set('grant_type', 'ig_refresh_token');
  url.searchParams.set('access_token', currentToken);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  const data = (await res.json()) as FbTokenResponse & { error?: { message: string } };

  if (!res.ok || data.error) {
    throw new Error(`Token refresh failed: ${data.error?.message ?? res.statusText}`);
  }

  const newExpiry = new Date(Date.now() + (data.expires_in ?? 5_184_000) * 1_000);

  await query(
    `UPDATE social_accounts SET access_token = $1, token_expires_at = $2, updated_at = NOW() WHERE id = $3`,
    [data.access_token, newExpiry, id],
  );
}

// ---------------------------------------------------------------------------
// Token retrieval (used by instagramAdapter)
// ---------------------------------------------------------------------------

export interface StoredInstagramCredentials {
  accessToken: string;
  businessAccountId: string;
}

/** Get the active Instagram token for an org. Falls back to env vars if no DB record. */
export async function getInstagramCredentials(
  organizationId: string | undefined,
): Promise<StoredInstagramCredentials | null> {
  if (organizationId) {
    const rows = await query<{
      access_token: string;
      meta: Record<string, unknown>;
      platform_user_id: string;
    }>(
      `SELECT access_token, meta, platform_user_id
       FROM social_accounts
       WHERE organization_id = $1 AND platform = 'instagram' AND is_active = TRUE
       ORDER BY connected_at DESC
       LIMIT 1`,
      [organizationId],
    );

    if (rows.rows.length) {
      const row = rows.rows[0];
      return {
        accessToken: row.access_token,
        businessAccountId: row.platform_user_id,
      };
    }
  }

  // Fall back to env vars (legacy / single-tenant setup)
  const envToken = process.env.META_GRAPH_ACCESS_TOKEN?.trim();
  const envAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();
  if (envToken && envAccountId) {
    return { accessToken: envToken, businessAccountId: envAccountId };
  }

  return null;
}

// ---------------------------------------------------------------------------
// List connected accounts
// ---------------------------------------------------------------------------

export async function listInstagramAccounts(organizationId: string) {
  const rows = await query<{
    id: string;
    platform_user_id: string;
    platform_username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    token_expires_at: string | null;
    connected_at: string;
    meta: Record<string, unknown>;
  }>(
    `SELECT id, platform_user_id, platform_username, display_name, avatar_url,
            token_expires_at, connected_at, meta
     FROM social_accounts
     WHERE organization_id = $1 AND platform = 'instagram' AND is_active = TRUE
     ORDER BY connected_at DESC`,
    [organizationId],
  );

  return rows.rows.map((r) => ({
    ...r,
    token_expires_at: r.token_expires_at ?? null,
    is_expiring_soon: r.token_expires_at
      ? new Date(r.token_expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
      : false,
  }));
}

// ---------------------------------------------------------------------------
// Disconnect
// ---------------------------------------------------------------------------

export async function disconnectInstagramAccount(
  organizationId: string,
  platformUserId: string,
): Promise<void> {
  await query(
    `UPDATE social_accounts SET is_active = FALSE, updated_at = NOW()
     WHERE organization_id = $1 AND platform = 'instagram' AND platform_user_id = $2`,
    [organizationId, platformUserId],
  );
}

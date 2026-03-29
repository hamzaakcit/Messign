// ---------------------------------------------------------------------------
// Vertex AI — OAuth access token for Gemini generateContent (aiplatform.googleapis.com)
// ---------------------------------------------------------------------------
// Requires one of:
//   VERTEX_AI_ACCESS_TOKEN — short-lived bearer (e.g. CI); prefer ADC in production
//   GOOGLE_APPLICATION_CREDENTIALS — service account JSON path
//   Default credentials (GCE / Cloud Run / gcloud application-default login)
//
// Also set VERTEX_AI_PROJECT (or GOOGLE_CLOUD_PROJECT) and optionally VERTEX_AI_LOCATION.
// ---------------------------------------------------------------------------

import { GoogleAuth } from 'google-auth-library';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

/**
 * Returns the configured GCP project id for Vertex AI `generateContent`, if any.
 */
export function getVertexProjectId(): string | undefined {
  const p =
    process.env.VERTEX_AI_PROJECT?.trim() ||
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCP_PROJECT?.trim() ||
    '';
  return p.length > 0 ? p : undefined;
}

/**
 * Region segment in the Vertex hostname (default `us-central1`).
 */
export function getVertexLocation(): string {
  return process.env.VERTEX_AI_LOCATION?.trim() || 'us-central1';
}

let googleAuthSingleton: GoogleAuth | null = null;

function getGoogleAuth(): GoogleAuth {
  if (!googleAuthSingleton) {
    googleAuthSingleton = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });
  }
  return googleAuthSingleton;
}

/**
 * Returns a Bearer token for Vertex AI REST calls, or null if nothing is configured.
 */
export async function getVertexAccessToken(): Promise<string | null> {
  const fromEnv = process.env.VERTEX_AI_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  try {
    const auth = getGoogleAuth();
    const client = await auth.getClient();
    const res = await client.getAccessToken();
    if (res.token) return res.token;
  } catch (e) {
    console.warn('[vertexGeminiAuth] getAccessToken failed', {
      message: e instanceof Error ? e.message : String(e),
    });
  }
  return null;
}

/**
 * REST URL for Vertex AI Publisher `generateContent` (multimodal-capable Gemini).
 * @see https://cloud.google.com/vertex-ai/docs/reference/rest/v1/projects.locations.publishers.models/generateContent
 */
export function buildVertexGeminiGenerateContentUrl(
  projectId: string,
  location: string,
  modelId: string,
): string {
  const enc = encodeURIComponent;
  return `https://${enc(location)}-aiplatform.googleapis.com/v1/projects/${enc(projectId)}/locations/${enc(location)}/publishers/google/models/${enc(modelId)}:generateContent`;
}

/**
 * Google Cloud API key for the global Publisher API (query param), e.g. curl to
 * `aiplatform.googleapis.com/v1/publishers/google/models/MODEL:generateContent?key=...`
 * Distinct from Gemini AI Studio (`GOOGLE_GEMINI_API_KEY` → generativelanguage.googleapis.com).
 */
export function getGlobalAiplatformApiKey(): string | undefined {
  const k =
    process.env.GEMINI_AIPLATFORM_API_KEY?.trim() ||
    process.env.GOOGLE_CLOUD_API_KEY?.trim() ||
    '';
  return k.length > 0 ? k : undefined;
}

/**
 * Global Vertex AI Publisher URL with `?key=` (no project/region in path).
 * @see https://cloud.google.com/vertex-ai/docs/reference/rest/v1/projects.locations.publishers.models/generateContent
 */
export function buildGlobalPublisherGeminiGenerateContentUrl(modelId: string, apiKey: string): string {
  const base = `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(modelId)}:generateContent`;
  return `${base}?key=${encodeURIComponent(apiKey)}`;
}

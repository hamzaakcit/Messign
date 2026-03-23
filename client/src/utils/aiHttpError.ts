/**
 * Parse API error body so UI shows server validation messages (e.g. 400 from aiInputValidation).
 */
export async function formatAiHttpError(
  response: Response,
  fallbackPrefix = 'AI request failed',
): Promise<string> {
  const base = `${fallbackPrefix}: ${response.status} ${response.statusText}`;
  try {
    const ct = response.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const j = (await response.json()) as { error?: string; message?: string };
      const msg = j.error ?? j.message;
      if (typeof msg === 'string' && msg.trim()) {
        return `${msg} (${response.status})`;
      }
    } else {
      const text = await response.text();
      const snippet = text.trim().slice(0, 400);
      if (snippet) return `${base} — ${snippet}`;
    }
  } catch {
    /* ignore parse errors */
  }
  return base;
}

/**
 * Messign AI Brain — Input Validation & Sanitization
 *
 * Validates and sanitizes user queries before they reach the AI system.
 * Prevents:
 * - Prompt injection attempts
 * - Excessively long queries
 * - Empty/null queries
 * - Malicious characters
 *
 * This runs BEFORE the rate limiter and route handler.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Maximum query length in characters.
 * Long queries waste tokens and may be prompt injection attempts.
 */
const MAX_QUERY_LENGTH = 2000;

/**
 * Minimum query length (after trimming).
 */
const MIN_QUERY_LENGTH = 1;

/**
 * Maximum conversation history messages to accept.
 */
const MAX_HISTORY_LENGTH = 20;

/**
 * Maximum length of each history message.
 */
const MAX_HISTORY_MESSAGE_LENGTH = 5000;

/**
 * Patterns that indicate prompt injection attempts.
 * These are checked against the query to detect manipulation.
 *
 * NOTE: This is a defense-in-depth measure. The primary defense
 * is that tools use parameterized SQL and the LLM never writes SQL.
 * These patterns catch attempts to manipulate the LLM's behavior.
 */
const INJECTION_PATTERNS: RegExp[] = [
  // Direct instruction override attempts
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above\s+instructions/i,
  /disregard\s+(all\s+)?previous/i,
  /forget\s+(all\s+)?previous/i,
  /override\s+(system|safety)\s+prompt/i,

  // System prompt extraction attempts
  /what\s+is\s+your\s+system\s+prompt/i,
  /show\s+me\s+your\s+(system\s+)?prompt/i,
  /repeat\s+(your\s+)?(system\s+)?instructions/i,
  /print\s+(your\s+)?(system\s+)?prompt/i,
  /output\s+(your\s+)?(system\s+)?instructions/i,

  // Role manipulation
  /you\s+are\s+now\s+(a|an|in)\s+/i,
  /pretend\s+you\s+are/i,
  /act\s+as\s+if\s+you\s+(are|were)\s+/i,
  /switch\s+to\s+.+\s+mode/i,
  /enter\s+(developer|admin|debug|god)\s+mode/i,

  // SQL injection via LLM (defense-in-depth)
  /;\s*DROP\s+TABLE/i,
  /;\s*DELETE\s+FROM/i,
  /;\s*UPDATE\s+.+\s+SET/i,
  /;\s*INSERT\s+INTO/i,
  /UNION\s+SELECT/i,
  /--\s*$/m,

  // Tool manipulation attempts
  /call\s+tool\s+.+\s+with\s+raw\s+sql/i,
  /execute\s+sql\s+directly/i,
  /run\s+this\s+query/i,
  /bypass\s+(permission|auth|rbac)/i,
];

/**
 * Check if a query contains prompt injection patterns.
 * Returns the matched pattern description if found, null if clean.
 */
function detectInjection(query: string): string | null {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(query)) {
      return pattern.source.slice(0, 50); // Return truncated pattern for logging
    }
  }
  return null;
}

/**
 * Sanitize a string by removing potentially dangerous characters
 * while keeping it readable.
 */
function sanitizeString(input: string): string {
  return input
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters (except newline and tab)
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Trim excessive whitespace
    .replace(/\s{10,}/g, '  ')
    // Trim
    .trim();
}

/**
 * Middleware: Validate and sanitize AI answer requests.
 * Apply to: POST /ai/answer
 */
export function validateAIAnswerInput(req: Request, res: Response, next: NextFunction): void {
  const rawBody = req.body as Record<string, unknown>;
  const { query, history, concise } = rawBody;

  // ---- Validate query ----
  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'Query is required and must be a string.' });
    return;
  }

  const sanitizedQuery = sanitizeString(query);

  if (sanitizedQuery.length < MIN_QUERY_LENGTH) {
    res.status(400).json({ error: 'Query is too short. Please provide a more specific question.' });
    return;
  }

  if (sanitizedQuery.length > MAX_QUERY_LENGTH) {
    res.status(400).json({
      error: `Query is too long (${sanitizedQuery.length} chars). Maximum is ${MAX_QUERY_LENGTH} characters.`,
    });
    return;
  }

  // ---- Check for prompt injection ----
  const injectionMatch = detectInjection(sanitizedQuery);
  if (injectionMatch) {
    const user = (req as Request & { user?: { id: string } }).user;
    console.warn(`[AI Input Validation] Prompt injection detected from user ${user?.id}: pattern="${injectionMatch}", query="${sanitizedQuery.slice(0, 100)}"`);
    // Don't reveal that we detected injection — just return a generic message
    res.status(400).json({
      error: 'I cannot process that request. Please rephrase your question about company data.',
    });
    return;
  }

  // ---- Validate history ----
  let sanitizedHistory: { role: string; content: string }[] = [];
  if (history) {
    if (!Array.isArray(history)) {
      res.status(400).json({ error: 'History must be an array.' });
      return;
    }

    sanitizedHistory = history
      .slice(-MAX_HISTORY_LENGTH) // Limit number of messages
      .filter((h: unknown) =>
        h && typeof h === 'object' &&
        typeof (h as { role?: unknown }).role === 'string' &&
        typeof (h as { content?: unknown }).content === 'string' &&
        ['user', 'assistant'].includes((h as { role: string }).role)
      )
      .map((h: { role: string; content: string }) => ({
        role: (h as { role: string }).role,
        content: sanitizeString((h as { content: string }).content).slice(0, MAX_HISTORY_MESSAGE_LENGTH),
      }));
  }

  // ---- Interaction mode (Ask / Analyze / Act) ----
  let interactionMode: 'ask' | 'analyze' | 'act' = 'ask';
  if (typeof rawBody.mode === 'string') {
    const m = sanitizeString(rawBody.mode).toLowerCase();
    if (m === 'ask' || m === 'analyze' || m === 'act') interactionMode = m;
  }

  const confirmedMutation = rawBody.confirmed === true || rawBody.confirmed === 'true';

  let confirmationPayload: Record<string, unknown> | undefined;
  if (rawBody.confirmation && typeof rawBody.confirmation === 'object' && rawBody.confirmation !== null) {
    try {
      const s = JSON.stringify(rawBody.confirmation);
      if (s.length <= 8000) {
        confirmationPayload = JSON.parse(s) as Record<string, unknown>;
      }
    } catch {
      /* ignore malformed confirmation */
    }
  }

  // Analyze & Act → non-concise synthesis; Ask uses concise flag from client
  const sanitizedConcise =
    interactionMode === 'analyze' || interactionMode === 'act'
      ? false
      : !(concise === false || concise === 'false');

  // ---- Validate currentPath (optional, from Dora page-awareness) ----
  const MAX_PATH_LENGTH = 200;
  let sanitizedCurrentPath = '';
  const { currentPath } = req.body;
  if (currentPath && typeof currentPath === 'string') {
    let path = sanitizeString(currentPath).split('?')[0]!.split('#')[0]!;
    if (path.startsWith('/') && path.length <= MAX_PATH_LENGTH) {
      sanitizedCurrentPath = path;
    }
  }

  const extras: Record<string, unknown> = {};

  if (typeof rawBody.sessionId === 'string') {
    extras.sessionId = sanitizeString(rawBody.sessionId).slice(0, 120);
  }
  if (typeof rawBody.searchMode === 'boolean') {
    extras.searchMode = rawBody.searchMode;
  }
  if (typeof rawBody.provider === 'string') {
    const p = sanitizeString(rawBody.provider).slice(0, 24);
    if (p === 'auto' || p === 'claude') extras.provider = p;
  }
  if (typeof rawBody.intent === 'string') {
    const id = sanitizeString(rawBody.intent).replace(/[^\w.-]/g, '').slice(0, 120);
    if (id) extras.intent = id;
  }
  if (rawBody.widgetContext && typeof rawBody.widgetContext === 'object' && rawBody.widgetContext !== null) {
    try {
      const s = JSON.stringify(rawBody.widgetContext);
      if (s.length <= 12000) {
        extras.widgetContext = JSON.parse(s) as unknown;
      }
    } catch {
      /* ignore malformed widgetContext */
    }
  }

  // Replace request body with sanitized values (preserve optional fields used by /ai/answer)
  req.body = {
    query: sanitizedQuery,
    history: sanitizedHistory,
    concise: sanitizedConcise,
    currentPath: sanitizedCurrentPath,
    mode: interactionMode,
    confirmed: confirmedMutation,
    ...(confirmationPayload ? { confirmation: confirmationPayload } : {}),
    ...extras,
  };

  next();
}

/**
 * Middleware: Validate presentation generation requests.
 * Apply to: POST /ai/presentation
 */
export function validateAIPresentationInput(req: Request, res: Response, next: NextFunction): void {
  const { topic, slideCount } = req.body;

  if (!topic || typeof topic !== 'string') {
    res.status(400).json({ error: 'Topic is required and must be a string.' });
    return;
  }

  const sanitizedTopic = sanitizeString(topic);

  if (sanitizedTopic.length < 3) {
    res.status(400).json({ error: 'Topic is too short.' });
    return;
  }

  if (sanitizedTopic.length > 500) {
    res.status(400).json({ error: 'Topic is too long. Maximum 500 characters.' });
    return;
  }

  const injectionMatch = detectInjection(sanitizedTopic);
  if (injectionMatch) {
    const user = (req as Request & { user?: { id: string } }).user;
    console.warn(`[AI Input Validation] Injection in presentation topic from user ${user?.id}`);
    res.status(400).json({ error: 'Invalid topic. Please rephrase.' });
    return;
  }

  const sanitizedSlideCount = Math.min(Math.max(parseInt(String(slideCount)) || 8, 3), 20);

  req.body = {
    topic: sanitizedTopic,
    slideCount: sanitizedSlideCount,
  };

  next();
}

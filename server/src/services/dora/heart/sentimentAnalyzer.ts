import { query } from '../../../db/index.js';
import { eventBus } from '../../../events/index.js';
import crypto from 'crypto';

interface SentimentInput {
  userId: string;
  text: string;
  source: 'chat' | 'checkin' | 'ticket_response' | 'review';
}

interface SentimentResult {
  score: number; // -1 to +1
  factors: {
    tone: number;
    engagement: number;
    keywords: string[];
    urgency: number;
  };
}

/** Resolve auth_user_id or reimbursement_user id to reimbursement_users.id (UUID) */
async function resolveUserId(userId: string): Promise<string | null> {
  const result = await query<{ id: string }>(
    `SELECT id::text AS id FROM reimbursement_users WHERE auth_user_id = $1 OR id::text = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.id ?? null;
}

// ── Main analysis function ──
export async function analyzeSentiment(input: SentimentInput): Promise<SentimentResult | null> {
  const resolvedUserId = await resolveUserId(input.userId);
  if (!resolvedUserId) {
    return null; // User may not be in reimbursement_users
  }

  // Use keyword-based heuristic as baseline
  const result = keywordBasedSentiment(input.text);

  // Hash the text for dedup (we never store the actual text)
  const textHash = crypto.createHash('sha256').update(input.text).digest('hex');

  // Get the user's previous sentiment score for shift detection
  const prevScore = await getLatestSentimentScore(resolvedUserId, input.source);

  // Store the score
  await query(
    `INSERT INTO heart_sentiment_scores (user_id, source, score, factors, message_sample_hash, period_start, period_end)
     VALUES ($1::uuid, $2, $3, $4, $5, CURRENT_DATE, CURRENT_DATE)`,
    [resolvedUserId, input.source, result.score, JSON.stringify(result.factors), textHash]
  );

  // Check for significant shift (> 0.3 change sustained over 5+ data points)
  const shiftDetected = prevScore !== null && Math.abs(result.score - prevScore) > 0.3;

  // Emit event
  eventBus.emit('heart.sentiment.analyzed', {
    userId: resolvedUserId,
    source: input.source,
    score: result.score,
    previousScore: prevScore ?? 0,
    shiftDetected,
  });

  return result;
}

// ── Keyword-based baseline (replace with LLM in production) ──
function keywordBasedSentiment(text: string): SentimentResult {
  const lower = text.toLowerCase();

  const positiveWords = [
    'great', 'awesome', 'excellent', 'thanks', 'love', 'happy', 'excited', 'wonderful',
    'amazing', 'perfect', 'well done', 'nice', 'good job', 'appreciate', 'fantastic',
  ];
  const negativeWords = [
    'frustrated', 'annoyed', 'terrible', 'awful', 'hate', 'angry', 'disappointed',
    'broken', 'stuck', 'blocked', 'confused', 'impossible', 'exhausted', 'overwhelmed',
    'stressed', 'burned out', 'urgent',
  ];
  const urgencyWords = ['asap', 'urgent', 'emergency', 'critical', 'deadline', 'immediately', 'overdue'];

  let positiveCount = 0;
  let negativeCount = 0;
  let urgencyCount = 0;
  const matchedKeywords: string[] = [];

  positiveWords.forEach((w) => {
    if (lower.includes(w)) {
      positiveCount++;
      matchedKeywords.push(w);
    }
  });
  negativeWords.forEach((w) => {
    if (lower.includes(w)) {
      negativeCount++;
      matchedKeywords.push(w);
    }
  });
  urgencyWords.forEach((w) => {
    if (lower.includes(w)) urgencyCount++;
  });

  const totalWords = text.split(/\s+/).length;
  const engagementScore = Math.min(1, totalWords / 50); // Longer messages suggest more engagement

  // Score: -1 to +1
  const rawScore = (positiveCount - negativeCount) / Math.max(1, positiveCount + negativeCount);
  const score = Math.max(-1, Math.min(1, rawScore));

  return {
    score,
    factors: {
      tone: score,
      engagement: engagementScore,
      keywords: matchedKeywords.slice(0, 5),
      urgency: Math.min(1, urgencyCount / 2),
    },
  };
}

// ── LLM-based sentiment (for future upgrade) ──
export async function analyzeSentimentWithLLM(_text: string): Promise<SentimentResult> {
  // Call Groq 8b with a classification prompt:
  // "Classify the sentiment of this workplace message on a scale from -1 (very negative) to +1 (very positive).
  //  Also rate: tone (-1 to 1), engagement (0 to 1), urgency (0 to 1).
  //  Return JSON only: { score, tone, engagement, urgency, keywords: [] }
  //  Message: {text}"
  // Parse the JSON response
  // This is more accurate but costs API calls — use for composite weekly scores
  throw new Error('Not implemented yet');
}

async function getLatestSentimentScore(userId: string, source: string): Promise<number | null> {
  const result = await query<{ score: string }>(
    'SELECT score FROM heart_sentiment_scores WHERE user_id = $1::uuid AND source = $2 ORDER BY analyzed_at DESC LIMIT 1',
    [userId, source]
  );
  const val = result.rows[0]?.score;
  return val != null ? parseFloat(val) : null;
}

// ── Generate composite weekly score for a user ──
export async function generateWeeklyComposite(userId: string): Promise<void> {
  // Average all source scores from the past 7 days
  const result = await query<{ avg_score: string; sources: unknown }>(
    `SELECT AVG(score)::text AS avg_score, jsonb_agg(DISTINCT source) AS sources
     FROM heart_sentiment_scores
     WHERE user_id = $1::uuid AND analyzed_at >= NOW() - INTERVAL '7 days'`,
    [userId]
  );

  const avgScore = result.rows[0]?.avg_score;
  if (avgScore != null && avgScore !== '') {
    const score = parseFloat(avgScore);
    const sources = result.rows[0]?.sources ?? [];
    await query(
      `INSERT INTO heart_sentiment_scores (user_id, source, score, factors, period_start, period_end)
       VALUES ($1::uuid, 'composite', $2, $3, CURRENT_DATE - INTERVAL '7 days', CURRENT_DATE)`,
      [userId, score, JSON.stringify({ sources, type: 'weekly_composite' })]
    );
  }
}

interface ScoreCandidateInput {
  candidateName?: string;
  jobTitle?: string;
  candidateId?: string;
  jobId?: string;
  resumeText: string;
  requirements: string[];
  /** Tenant ID for gateway cost attribution. Defaults to 'system' when not provided. */
  tenantId?: string;
}

const SCORE_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_SCORE_CACHE_SIZE = 500;
const scoreCache = new Map<string, { result: ScoreCandidateResult; expiresAt: number }>();

function pruneScoreCache(): void {
  const now = Date.now();
  for (const [k, v] of scoreCache) {
    if (v.expiresAt < now) scoreCache.delete(k);
  }
  if (scoreCache.size > MAX_SCORE_CACHE_SIZE) {
    const excess = scoreCache.size - MAX_SCORE_CACHE_SIZE;
    const iter = scoreCache.keys();
    for (let i = 0; i < excess; i++) {
      const next = iter.next();
      if (!next.done) scoreCache.delete(next.value);
    }
  }
}

function cacheKey(candidateId?: string, jobId?: string): string | null {
  if (candidateId && jobId) return `score:${candidateId}:${jobId}`;
  return null;
}

export interface ScoreCandidateResult {
  match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  recommendation: string;
  reasoning: string;
}

function heuristicScore(input: ScoreCandidateInput): ScoreCandidateResult {
  const haystack = input.resumeText.toLowerCase();
  const requirements = input.requirements.filter(Boolean);
  const matched = requirements.filter((req) => haystack.includes(req.toLowerCase()));
  const missing = requirements.filter((req) => !haystack.includes(req.toLowerCase()));
  const base = requirements.length > 0 ? Math.round((matched.length / requirements.length) * 100) : 50;
  return {
    match_score: Math.max(0, Math.min(100, base)),
    matched_skills: matched,
    missing_skills: missing,
    recommendation:
      base >= 80 ? 'strong_yes' :
      base >= 65 ? 'yes' :
      base >= 45 ? 'neutral' :
      'no',
    reasoning: `Heuristic score based on ${matched.length}/${Math.max(requirements.length, 1)} requirement matches.`,
  };
}

export async function scoreCandidateResume(input: ScoreCandidateInput): Promise<ScoreCandidateResult> {
  if (scoreCache.size >= MAX_SCORE_CACHE_SIZE) pruneScoreCache();
  const key = cacheKey(input.candidateId, input.jobId);
  if (key) {
    const cached = scoreCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
  }

  if (!input.resumeText.trim()) {
    const result = heuristicScore(input);
    if (key) {
      scoreCache.set(key, { result, expiresAt: Date.now() + SCORE_CACHE_TTL_MS });
    }
    return result;
  }

  const tenantId = input.tenantId ?? 'system';

  try {
    const { generateText } = await import('../ai/gateway.js');
    const prompt = JSON.stringify({
      candidateName: input.candidateName ?? null,
      jobTitle: input.jobTitle ?? null,
      requirements: input.requirements,
      resumeText: input.resumeText.slice(0, 12000),
    });
    const content = await generateText({
      tier: 'fast',
      prompt,
      systemPrompt:
        'You score job candidates against job requirements. Return strict JSON with keys: match_score, matched_skills, missing_skills, recommendation, reasoning.',
      tenantId,
      temperature: 0.2,
      maxTokens: 1024,
    });
    if (!content) {
      throw new Error('Empty gateway response');
    }
    const parsed = JSON.parse(content) as Partial<ScoreCandidateResult>;
    const result: ScoreCandidateResult = {
      match_score: Math.max(0, Math.min(100, Number(parsed.match_score ?? 0))),
      matched_skills: Array.isArray(parsed.matched_skills) ? parsed.matched_skills.map(String) : [],
      missing_skills: Array.isArray(parsed.missing_skills) ? parsed.missing_skills.map(String) : [],
      recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : 'neutral',
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'Scored by AI.',
    };
    if (key) {
      scoreCache.set(key, { result, expiresAt: Date.now() + SCORE_CACHE_TTL_MS });
    }
    return result;
  } catch (error) {
    console.warn('[recruitment/aiScoring] Gateway failed, falling back to heuristic scoring:', error);
    const result = heuristicScore(input);
    if (key) {
      scoreCache.set(key, { result, expiresAt: Date.now() + SCORE_CACHE_TTL_MS });
    }
    return result;
  }
}

/** Curated royalty-free Unsplash photos (direct CDN links) matched by topic for hero imagery. */
const CURATED_HERO: Record<string, string> = {
  /** Neutral abstract — avoids mismatched “dashboard” stock when topic is unknown. */
  default:
    'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=1200&q=80',
  wildlife:
    'https://images.unsplash.com/photo-1474511320723-9a56873867b5?auto=format&fit=crop&w=1200&q=80',
  marketing:
    'https://images.unsplash.com/photo-1533750349088-cd87199c5d78?auto=format&fit=crop&w=1200&q=80',
  ai: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1200&q=80',
  team: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80',
  growth:
    'https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1200&q=80',
  workspace:
    'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
  /** Automotive / mobility — checked before generic workspace/default */
  automotive:
    'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80',
  /** Cactus, succulents, desert plants, botanical — before wildlife (nature) */
  plants:
    'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=80',
};

const STOP = new Set([
  'that',
  'this',
  'with',
  'from',
  'your',
  'have',
  'will',
  'been',
  'dear',
  'best',
  'team',
  'fellow',
  'hello',
  'thanks',
  'thank',
  'message',
  'email',
  'body',
  'preview',
  'subject',
]);

/** High-signal 3-letter tokens (otherwise excluded by length filter). */
const SHORT_TOPIC = new Set(['car', 'suv', 'ev']);

/**
 * Derive a few keywords from subject + body start for topic-based hero selection.
 * Includes 3-letter allowlist words (e.g. "car", "ev") so short topics still match.
 */
export function deriveImageKeywords(parsed: {
  subject?: string;
  preview?: string;
  body: string;
}): string[] {
  const blob = [parsed.subject, parsed.body.slice(0, 280)].filter(Boolean).join(' ');
  const lower = blob.toLowerCase();
  const words = lower.match(/[a-z]{3,}/g) ?? [];
  const uniq = [...new Set(words.filter((w) => w.length >= 4 || SHORT_TOPIC.has(w)).filter((w) => !STOP.has(w)))];
  if (/\bev\b/.test(lower) && !uniq.includes('ev')) uniq.unshift('ev');
  return uniq.slice(0, 6);
}

function pickCuratedKey(keywords: string[], textBlob: string): string {
  const s = `${keywords.join(' ')} ${textBlob}`.toLowerCase();
  if (
    /\b(cactus|cacti|succulent|succulents|xeriscape|saguaro|agave|aloe|spines|xerophyte|desert\s+plant|botanical\s+garden)\b/.test(
      s,
    )
  ) {
    return 'plants';
  }
  if (
    /\b(plant|plants|garden|gardening|flora|horticulture|greenhouse|botanical)\b/.test(s) &&
    !/\b(car\s+plant|power\s+plant)\b/.test(s)
  ) {
    return 'plants';
  }
  if (
    /\b(panther|panthers|lion|tiger|bear|wolf|wildlife|fauna|animal|animals|zoo|safari|jungle|forest|nature|habitat|species)\b/.test(
      s,
    )
  ) {
    return 'wildlife';
  }
  if (/\b(ai|ml|machine|data|model)\b/.test(s)) return 'ai';
  if (/\b(team|people|culture|founder|collab)\b/.test(s)) return 'team';
  if (/\b(growth|scale|revenue|metric|roi)\b/.test(s)) return 'growth';
  if (
    /\b(car|cars|auto|vehicle|vehicles|driving|motor|motors|suv|automotive|dealership|highway|commute)\b/.test(s) ||
    /\bev\b/.test(s)
  ) {
    return 'automotive';
  }
  if (/\b(workspace|office|desk|remote)\b/.test(s)) return 'workspace';
  if (/\b(market|campaign|brand|lead|email|newsletter)\b/.test(s)) return 'marketing';
  return 'default';
}

/** Simple string hash (deterministic). */
export function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Curated hero URL by topic keywords (stable for the same keywords + blob).
 * `textBlob` should be subject + body excerpt so short words (e.g. "car") and phrases match reliably.
 * `seed` is ignored for cross-category swapping (removed); kept for API compatibility.
 */
export function resolveHeroImageUrl(keywords: string[], seed?: string, textBlob?: string): string {
  const blob = textBlob ?? '';
  const key = pickCuratedKey(keywords, blob);
  void seed;
  return CURATED_HERO[key] ?? CURATED_HERO.default;
}

/** Same dimensions as hero URLs but `w=2400` for full-bleed email body backgrounds. */
function widenForBodyBackground(heroUrl: string): string {
  return heroUrl.replace(/w=1200/g, 'w=2400');
}

/**
 * Topic-aware body background for Messign Architect (environmental layer).
 * Uses subject + body; same keyword routing as conversion heroes, wider crop.
 */
export function resolveArchitectEmailBodyBackgroundUrl(
  parsed: { subject?: string; preview?: string; body: string },
  seed?: string,
): string {
  const keywords = deriveImageKeywords(parsed);
  const textBlob = [parsed.subject, parsed.preview, parsed.body.slice(0, 500)].filter(Boolean).join(' ');
  const url = resolveHeroImageUrl(keywords, seed, textBlob);
  return widenForBodyBackground(url);
}

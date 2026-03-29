/**
 * Detects whether an email image prompt (plus optional manifest copy) explicitly asks
 * for human subjects. When this returns false, the pipeline may bias toward objects,
 * environments, products, and abstract scenes to avoid generic face-heavy stock output.
 */

function stripStockTag(prompt: string): string {
  return prompt.replace(/^\[STOCK\]\s*/i, ' ').trim();
}

/**
 * Returns true when the combined text clearly calls for people, faces, portraits, or
 * common human-centric hero scenes (e.g. engineer at desk).
 */
export function emailImagePromptExplicitlyRequestsPeople(prompt: string): boolean {
  let s = stripStockTag(prompt)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Negation phrases — "no people" / "without faces" must not flip intent to "wants people".
  s = s
    .replace(/\bno\s+people\b/g, ' ')
    .replace(/\bwithout\s+people\b/g, ' ')
    .replace(/\bno\s+humans?\b/g, ' ')
    .replace(/\bno\s+human\s+figures?\b/g, ' ')
    .replace(/\bno\s+faces?\b/g, ' ')
    .replace(/\bno\s+person\b/g, ' ')
    .replace(/\bno\s+portraits?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!s) return false;

  if (
    /\b(people|persons?|faces?|facial|portrait|portraits|headshot|headshots|selfies?|crowds?|group photos?|audiences?|women|men|woman|man|girls?|boys?|children|child|kids?|families|family|babies|baby|models?|athletes?|doctors?|nurses?|patients?|coworkers?|human figures?|humans?)\b/.test(
      s,
    )
  ) {
    return true;
  }

  if (/\b(hands?\s+(on|holding|typing|using))\b/.test(s)) return true;

  if (/\b(person|someone|anyone|woman|man|people)\s+(using|holding|typing|working|sitting|standing|walking)\b/.test(s)) {
    return true;
  }

  if (
    /\b(software\s+)?(engineer|developer|designer|founder|executive|ceo|cfo|cto|employee|patient|nurse|doctor|instructor|teacher|student|chef|barista|receptionist|salesperson)\b/.test(
      s,
    )
  ) {
    return true;
  }

  if (
    /\b(team\s+photo|photo\s+of\s+team|our\s+team|diverse\s+team|team\s+meeting|team\s+at|group\s+of\s+people|office\s+workers?)\b/.test(s)
  ) {
    return true;
  }

  if (/\b(smiling|laughing)\s+(person|woman|man|people|customer|client|face)\b/.test(s)) return true;

  if (/\bcustomer\s+(photo|portrait|story|spotlight|holding)\b/.test(s)) return true;

  if (/\b(portrait|headshot)\s+(of|session)\b/.test(s)) return true;

  return false;
}

const TECHNICAL_PLATFORM_COPY_SUBSTRINGS: readonly string[] = [
  'a2p',
  'messaging',
  'notification',
  'telecom',
  'webhook',
  'compliance',
  'deliverability',
  'infrastructure',
  'character limit',
  'sms',
];

/**
 * Returns true when campaign copy suggests B2B / platform / messaging imagery (A2P SMS, webhooks,
 * deliverability, etc.) so the image pipeline can steer away from generic faces and fake UI.
 */
export function emailCampaignCopySuggestsTechnicalPlatformImagery(text: string): boolean {
  const s = text.toLowerCase().trim();
  if (!s) return false;

  for (const sub of TECHNICAL_PLATFORM_COPY_SUBSTRINGS) {
    if (s.includes(sub)) return true;
  }

  return /\bapi\b/.test(s);
}

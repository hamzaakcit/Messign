import type { ComplianceScanResult } from './complianceScanner.js';

export function applyInstagramComplianceRules(
  result: ComplianceScanResult,
  args: {
    targetChannel: string;
    contentText: string;
    visualDescription?: string | null;
    imagePrompt?: string | null;
  },
): ComplianceScanResult {
  const ch = args.targetChannel.toLowerCase();
  if (ch !== 'instagram') return result;

  const updated = { ...result };
  const warnings = [...result.warnings];
  const issues = [...result.channel_specific_issues];
  let highCount = result.warning_count.high;
  let mediumCount = result.warning_count.medium;

  const hasImagePrompt =
    (args.imagePrompt?.trim().length ?? 0) > 10 ||
    (args.visualDescription?.trim().length ?? 0) > 10 ||
    /\[IMAGE_PROMPT\]/i.test(args.contentText);

  if (!hasImagePrompt) {
    issues.push('Instagram: No image prompt found. Posts require [IMAGE_PROMPT] block.');
    warnings.push({
      check: 'instagram_image_prompt',
      severity: 'HIGH',
      location: 'content',
      issue: 'Instagram posts require a visual/image description for generation.',
      suggestion: 'Add an [IMAGE_PROMPT]...[/IMAGE_PROMPT] block to the draft.',
    });
    highCount++;
  }

  const captionOnly = args.contentText
    .replace(/\[IMAGE_PROMPT(?::\d+)?\][\s\S]*?\[\/IMAGE_PROMPT(?::\d+)?\]/gi, '')
    .replace(/\[ALT_TEXT:.*?\]/gi, '')
    .trim();

  if (captionOnly.length > 2200) {
    issues.push(`Instagram: Caption is ${captionOnly.length} chars (limit: 2,200).`);
    warnings.push({
      check: 'instagram_caption_length',
      severity: 'HIGH',
      location: 'caption',
      issue: `Caption exceeds Instagram's 2,200 character limit (${captionOnly.length} chars).`,
      suggestion: 'Shorten the caption to fit within 2,200 characters.',
    });
    highCount++;
  }

  const hashtags = captionOnly.match(/#[\w\u00C0-\u024F]+/g) ?? [];
  if (hashtags.length < 5) {
    issues.push(`Instagram: Only ${hashtags.length} hashtags (recommended: 10-15).`);
    warnings.push({
      check: 'instagram_hashtag_count',
      severity: 'MEDIUM',
      location: 'hashtags',
      issue: `Only ${hashtags.length} hashtags found. 10-15 recommended for reach.`,
      suggestion: 'Add more targeted hashtags in a block at the end of the caption.',
    });
    mediumCount++;
  } else if (hashtags.length > 30) {
    issues.push(`Instagram: ${hashtags.length} hashtags — risk of shadow-ban (max 30).`);
    warnings.push({
      check: 'instagram_hashtag_excess',
      severity: 'HIGH',
      location: 'hashtags',
      issue: `${hashtags.length} hashtags found. Instagram allows max 30; more risks shadow-banning.`,
      suggestion: 'Reduce to 15-20 hashtags maximum.',
    });
    highCount++;
  }

  const urlPattern = /https?:\/\/[^\s)]+/gi;
  const captionWithoutPrompt = captionOnly.replace(/#[\w]+/g, '');
  const rawUrls = captionWithoutPrompt.match(urlPattern) ?? [];
  if (rawUrls.length > 0) {
    const isLinkInBioRef = /link\s+in\s+bio/i.test(captionOnly);
    if (!isLinkInBioRef) {
      issues.push('Instagram: Raw URL in caption — links are not clickable on Instagram.');
      warnings.push({
        check: 'instagram_raw_url',
        severity: 'MEDIUM',
        location: 'caption',
        issue: 'Raw URL found in caption. Instagram does not make caption links clickable.',
        suggestion: 'Remove the URL and use a "Link in bio" CTA instead.',
      });
      mediumCount++;
    }
  }

  const spamTags = new Set([
    '#followforfollow',
    '#fff',
    '#likeforlike',
    '#like4like',
    '#follow4follow',
    '#f4f',
    '#l4l',
    '#followback',
    '#instalike',
    '#tagsforlikes',
  ]);
  const foundSpam = hashtags.filter((h) => spamTags.has(h.toLowerCase()));
  if (foundSpam.length > 0) {
    issues.push(`Instagram: Spam hashtags detected: ${foundSpam.join(', ')}`);
    warnings.push({
      check: 'instagram_spam_hashtags',
      severity: 'MEDIUM',
      location: 'hashtags',
      issue: `Spam/banned hashtags found: ${foundSpam.join(', ')}. May cause shadow-banning.`,
      suggestion: 'Replace with topically relevant, niche hashtags.',
    });
    mediumCount++;
  }

  updated.warnings = warnings;
  updated.channel_specific_issues = issues;
  updated.warning_count = {
    ...result.warning_count,
    high: highCount,
    medium: mediumCount,
  };

  if (highCount > 0) {
    updated.verdict = 'WARNING';
  }

  return updated;
}

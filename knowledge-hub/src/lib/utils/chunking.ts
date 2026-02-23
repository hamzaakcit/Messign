export function chunkText(
  text: string,
  maxTokens: number = 500,
  overlap: number = 50
): string[] {
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length === 0) return [];
  if (words.length <= maxTokens) return [words.join(" ")];

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + maxTokens, words.length);
    chunks.push(words.slice(start, end).join(" "));

    if (end >= words.length) break;
    start = end - overlap;
  }

  return chunks;
}

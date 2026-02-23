/**
 * Dora Phase 2 — Heading-Aware Document Chunker
 *
 * Splits documents at semantic boundaries (headings, paragraphs) rather than
 * at arbitrary token counts. Preserves document structure and produces chunks
 * that carry complete ideas for better retrieval quality.
 *
 * Algorithm:
 * 1. Strip HTML, extract heading structure
 * 2. Split into sections at heading boundaries
 * 3. Merge sections below minChunkSize with neighbors
 * 4. Split sections above maxChunkSize at paragraph boundaries
 * 5. Prepend overlap sentences from the previous chunk
 * 6. Attach heading path as metadata
 */

import type {
  DocumentChunk,
  IngestionConfig,
  KHDocument,
  DEFAULT_INGESTION_CONFIG,
} from './types.js';

interface HeadingNode {
  level: number;
  text: string;
  startIndex: number;
}

interface Section {
  headingPath: string;
  headingLevel: number;
  sectionTitle: string;
  content: string;
}

function stripHtmlAndExtractHeadings(html: string): {
  plainText: string;
  headings: HeadingNode[];
} {
  const headings: HeadingNode[] = [];
  let plainText = '';
  let inTag = false;
  let currentTag = '';
  let tagBuffer = '';

  const decoded = html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));

  const withBreaks = decoded
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|blockquote)>/gi, '\n')
    .replace(/<\/(h[1-6])>/gi, (_, tag) => `</${tag}>`)
    .replace(/<hr\s*\/?>/gi, '\n---\n');

  let i = 0;
  while (i < withBreaks.length) {
    const char = withBreaks[i]!;

    if (char === '<') {
      inTag = true;
      tagBuffer = '<';
      i++;
      continue;
    }

    if (inTag) {
      tagBuffer += char;
      if (char === '>') {
        inTag = false;

        const headingOpen = tagBuffer.match(/^<(h[1-6])[\s>]/i);
        if (headingOpen) {
          currentTag = headingOpen[1]!.toLowerCase();
          const closeTag = `</${currentTag}>`;
          const closeIdx = withBreaks.indexOf(closeTag, i + 1);
          if (closeIdx !== -1) {
            const headingHtml = withBreaks.substring(i + 1, closeIdx);
            const headingText = headingHtml.replace(/<[^>]*>/g, '').trim();

            headings.push({
              level: parseInt(currentTag[1]!),
              text: headingText,
              startIndex: plainText.length,
            });

            plainText += '\n' + headingText + '\n';
            i = closeIdx + closeTag.length;
            currentTag = '';
            continue;
          }
        }

        if (tagBuffer.match(/^<li[\s>]/i)) {
          plainText += '\n• ';
        }

        tagBuffer = '';
      }
      i++;
      continue;
    }

    plainText += char;
    i++;
  }

  plainText = plainText
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');

  return { plainText, headings };
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function extractLastSentences(text: string, count: number): string {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 10);

  if (sentences.length === 0) return '';
  return sentences.slice(-count).join(' ');
}

function splitIntoSections(
  plainText: string,
  headings: HeadingNode[],
): Section[] {
  if (headings.length === 0) {
    return [{
      headingPath: 'Document',
      headingLevel: 0,
      sectionTitle: 'Document',
      content: plainText.trim(),
    }];
  }

  const sections: Section[] = [];
  const headingStack: Array<{ level: number; text: string }> = [];

  function buildPath(): string {
    return headingStack.map((h) => h.text).join(' > ');
  }

  function updateStack(level: number, text: string): void {
    while (headingStack.length > 0 && headingStack[headingStack.length - 1]!.level >= level) {
      headingStack.pop();
    }
    headingStack.push({ level, text });
  }

  if (headings[0]!.startIndex > 0) {
    const preamble = plainText.substring(0, headings[0]!.startIndex).trim();
    if (preamble.length > 0) {
      sections.push({
        headingPath: 'Introduction',
        headingLevel: 0,
        sectionTitle: 'Introduction',
        content: preamble,
      });
    }
  }

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i]!;
    const nextHeading = headings[i + 1];

    const contentStart = heading.startIndex + heading.text.length + 2;
    const contentEnd = nextHeading ? nextHeading.startIndex : plainText.length;
    const content = plainText.substring(contentStart, contentEnd).trim();

    updateStack(heading.level, heading.text);

    sections.push({
      headingPath: buildPath(),
      headingLevel: heading.level,
      sectionTitle: heading.text,
      content,
    });
  }

  return sections;
}

function assembleSections(
  sections: Section[],
  config: IngestionConfig,
): Array<{ content: string; headingPath: string; headingLevel: number; sectionTitle: string }> {
  const { targetChunkSize, maxChunkSize, minChunkSize } = config;
  const assembled: Array<{
    content: string;
    headingPath: string;
    headingLevel: number;
    sectionTitle: string;
  }> = [];

  let mergeBuffer: Section | null = null;

  for (const section of sections) {
    const tokens = estimateTokens(section.content);
    if (tokens === 0) continue;

    if (tokens < minChunkSize) {
      if (mergeBuffer) {
        mergeBuffer = {
          ...mergeBuffer,
          content: mergeBuffer.content + '\n\n' + section.sectionTitle + '\n' + section.content,
        };
      } else {
        mergeBuffer = { ...section };
      }
      continue;
    }

    if (mergeBuffer) {
      const mergedTokens = estimateTokens(mergeBuffer.content);
      const combinedTokens = mergedTokens + tokens;

      if (combinedTokens <= maxChunkSize) {
        assembled.push({
          content: mergeBuffer.content + '\n\n' + section.sectionTitle + '\n' + section.content,
          headingPath: mergeBuffer.headingPath,
          headingLevel: mergeBuffer.headingLevel,
          sectionTitle: mergeBuffer.sectionTitle,
        });
        mergeBuffer = null;
        continue;
      } else {
        assembled.push({
          content: mergeBuffer.content,
          headingPath: mergeBuffer.headingPath,
          headingLevel: mergeBuffer.headingLevel,
          sectionTitle: mergeBuffer.sectionTitle,
        });
        mergeBuffer = null;
      }
    }

    if (tokens > maxChunkSize) {
      const paragraphs = section.content.split(/\n{2,}/);
      let currentContent = '';
      let subIndex = 0;

      for (const para of paragraphs) {
        const paraTokens = estimateTokens(para);
        const currentTokens = estimateTokens(currentContent);

        if (currentTokens + paraTokens > targetChunkSize && currentContent.length > 0) {
          assembled.push({
            content: currentContent.trim(),
            headingPath: section.headingPath + (subIndex > 0 ? ' (cont.)' : ''),
            headingLevel: section.headingLevel,
            sectionTitle: section.sectionTitle,
          });
          currentContent = '';
          subIndex++;
        }

        currentContent += (currentContent ? '\n\n' : '') + para;
      }

      if (currentContent.trim().length > 0) {
        assembled.push({
          content: currentContent.trim(),
          headingPath: section.headingPath + (subIndex > 0 ? ' (cont.)' : ''),
          headingLevel: section.headingLevel,
          sectionTitle: section.sectionTitle,
        });
      }
      continue;
    }

    assembled.push({
      content: section.content,
      headingPath: section.headingPath,
      headingLevel: section.headingLevel,
      sectionTitle: section.sectionTitle,
    });
  }

  if (mergeBuffer) {
    assembled.push({
      content: mergeBuffer.content,
      headingPath: mergeBuffer.headingPath,
      headingLevel: mergeBuffer.headingLevel,
      sectionTitle: mergeBuffer.sectionTitle,
    });
  }

  return assembled;
}

export function chunkDocument(
  document: KHDocument,
  config: Partial<IngestionConfig> = {},
): DocumentChunk[] {
  const cfg: IngestionConfig = {
    targetChunkSize: config.targetChunkSize ?? 500,
    maxChunkSize: config.maxChunkSize ?? 700,
    minChunkSize: config.minChunkSize ?? 80,
    overlapSentences: config.overlapSentences ?? 2,
    embeddingBatchSize: config.embeddingBatchSize ?? 5,
    generateSummary: config.generateSummary ?? true,
    skipUnchanged: config.skipUnchanged ?? true,
  };

  const rawContent = document.plainText || document.content || '';
  const { plainText, headings } = stripHtmlAndExtractHeadings(rawContent);

  if (!plainText || plainText.trim().length === 0) {
    console.warn(`[Chunker] Document "${document.title}" has no text content after stripping.`);
    return [];
  }

  const sections = splitIntoSections(plainText, headings);
  const assembled = assembleSections(sections, cfg);

  if (assembled.length === 0) {
    console.warn(`[Chunker] Document "${document.title}" produced no chunks after assembly.`);
    return [];
  }

  const totalChunks = assembled.length;
  const chunks: DocumentChunk[] = [];

  for (let i = 0; i < assembled.length; i++) {
    const item = assembled[i]!;
    let content = item.content;

    if (i > 0 && cfg.overlapSentences > 0) {
      const overlapText = extractLastSentences(
        assembled[i - 1]!.content,
        cfg.overlapSentences,
      );
      if (overlapText) {
        content = `[...] ${overlapText}\n\n${content}`;
      }
    }

    const tokenCount = estimateTokens(content);

    chunks.push({
      documentId: document.id,
      chunkIndex: i,
      content,
      headingPath: item.headingPath,
      headingLevel: item.headingLevel,
      tokenCount,
      metadata: {
        documentId: document.id,
        documentTitle: document.title,
        documentSlug: document.slug,
        documentType: document.documentType,
        categoryName: document.categoryName,
        authorName: document.authorName,
        tags: document.tags,
        sectionTitle: item.sectionTitle,
        chunkIndex: i,
        totalChunks,
        publishedAt: document.createdAt,
        updatedAt: document.updatedAt,
      },
    });
  }

  console.log(
    `[Chunker] "${document.title}" -> ${chunks.length} chunks ` +
    `(avg ${Math.round(chunks.reduce((s, c) => s + c.tokenCount, 0) / chunks.length)} tokens/chunk)`,
  );

  return chunks;
}

export function stripHtml(html: string): string {
  return stripHtmlAndExtractHeadings(html).plainText;
}

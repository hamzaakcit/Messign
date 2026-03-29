/**
 * Parse assistant markdown for Lucy / marketing Dora into simple sections
 * so the UI can show cards and tables instead of one wall of text.
 */

export interface MarketingReplySection {
  /** Short label for the section card */
  title: string;
  /** Markdown body (rendered downstream) */
  body: string;
}

const RATIONALE_HINT =
  /^(rationale|why\s+this|why\s+it\s+works|notes|requirements|checklist)\s*[:.]?\s*$/i;

/**
 * Detects if a paragraph is likely "meta" explanation rather than primary copy.
 */
function looksLikeRationaleBlock(text: string): boolean {
  const t = text.trim();
  if (RATIONALE_HINT.test(t.split('\n')[0] ?? '')) return true;
  return /hook|word\s*count|words\b|tone|superlative|character\b|draft\b/i.test(t) && t.length < 1200;
}

/**
 * Splits assistant content into titled sections when markdown uses ## / ### headings.
 */
function sectionsFromMarkdownHeadings(content: string): MarketingReplySection[] | null {
  const normalized = content.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const chunks: Array<{ title: string; lines: string[] }> = [];
  let preamble: string[] = [];
  let current: { title: string; lines: string[] } | null = null;

  const flushCurrent = (): void => {
    if (current) {
      chunks.push(current);
      current = null;
    }
  };

  for (const line of lines) {
    const hm = line.match(/^(#{2,3})\s+(.+)$/);
    if (hm) {
      flushCurrent();
      current = { title: hm[2].trim(), lines: [] };
      continue;
    }
    if (current) {
      current.lines.push(line);
    } else {
      preamble.push(line);
    }
  }
  flushCurrent();

  if (chunks.length === 0) return null;

  const pre = preamble.join('\n').trim();
  const out: MarketingReplySection[] = [];
  if (pre.length > 0) {
    out.push({ title: 'Context', body: pre });
  }
  for (const ch of chunks) {
    const body = ch.lines.join('\n').trim();
    if (body.length > 0) {
      out.push({ title: ch.title, body });
    }
  }
  return out.length > 0 ? out : null;
}

/**
 * When there are no headings, split prose into a few readable blocks.
 */
function sectionsFromParagraphs(content: string): MarketingReplySection[] {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  const blocks = normalized.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);
  if (blocks.length === 0) return [{ title: 'Reply', body: normalized }];
  if (blocks.length === 1) return [{ title: 'Reply', body: blocks[0] }];

  if (blocks.length === 2) {
    const [a, b] = blocks;
    if (looksLikeRationaleBlock(b)) {
      return [
        { title: 'Copy', body: a },
        { title: 'Notes', body: b },
      ];
    }
    return [
      { title: 'Reply', body: a },
      { title: 'More', body: b },
    ];
  }

  const last = blocks[blocks.length - 1];
  const rest = blocks.slice(0, -1);
  if (looksLikeRationaleBlock(last)) {
    const first = rest[0];
    const middle = rest.slice(1).join('\n\n');
    const sections: MarketingReplySection[] = [];
    if (first) sections.push({ title: 'Intro', body: first });
    if (middle) sections.push({ title: 'Copy', body: middle });
    sections.push({ title: 'Notes', body: last });
    return sections;
  }

  return [{ title: 'Reply', body: normalized }];
}

/**
 * Returns ordered sections for marketing assistant bubbles. Falls back to a single section.
 */
export function parseMarketingAssistantSections(content: string): MarketingReplySection[] {
  const fromHeadings = sectionsFromMarkdownHeadings(content);
  if (fromHeadings && fromHeadings.length > 0) return fromHeadings;
  return sectionsFromParagraphs(content);
}

/**
 * If section title suggests checklist / rationale, expose rows for a compact table.
 */
export function listItemsToTableRows(markdownBody: string): { label: string; value: string }[] | null {
  const lines = markdownBody.replace(/\r\n/g, '\n').split('\n');
  const rows: { label: string; value: string }[] = [];
  for (const line of lines) {
    const bullet = line.replace(/^\s*[-*]\s*/, '').trim();
    const m = bullet.match(/^\*\*([^*]+)\*\*\s*[:：]?\s*(.+)$/);
    if (m) {
      rows.push({ label: m[1].trim(), value: m[2].trim() });
      continue;
    }
    const plain = bullet.match(/^([^:：]{2,40})[:：]\s*(.+)$/);
    if (plain && plain[1].length <= 40) {
      rows.push({ label: plain[1].trim(), value: plain[2].trim() });
    }
  }
  return rows.length >= 2 ? rows : null;
}

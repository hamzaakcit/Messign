/**
 * Dora Phase 2 — Document Auto-Summarization
 *
 * Generates structured summaries for Knowledge Hub documents using:
 *   1. Groq (llama-3.3-70b-versatile) — primary
 *   2. Gemini (gemini-2.0-flash) — fallback
 *
 * Output includes: summary text, key topics, target audience, and complexity level.
 * Uses SHA-256 content hashing to skip re-summarization of unchanged documents.
 */

import crypto from 'crypto';
import { generateGroqCompletion } from '../knowledgeGroq.js';
import { generateGeminiAnswer } from '../knowledgeGemini.js';
import type { DocumentSummary, KHDocument } from './types.js';
import { stripHtml } from './chunker.js';

export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

const SUMMARIZATION_PROMPT = `You are a document analysis assistant for a company knowledge base.
Analyze the following document and produce a JSON object with exactly these fields:

{
  "summary": "A concise 2-4 sentence summary capturing the main purpose, key points, and conclusions.",
  "keyTopics": ["topic1", "topic2", ...],   // 3-7 key topics/themes (short phrases)
  "audience": "Brief description of intended audience (e.g. 'Engineering team', 'All employees')",
  "complexity": "basic|intermediate|advanced"
}

Rules:
- Summary: Focus on WHAT the document covers, WHY it matters, and KEY takeaways.
- keyTopics: Short phrases, not single words. Extract the 3-7 most important themes.
- complexity: "basic" for general/simple docs, "intermediate" for role-specific, "advanced" for deep technical.
- Return ONLY valid JSON, no markdown fences, no extra text.`;

function buildPromptMessages(document: KHDocument, plainText: string): Array<{ role: 'system' | 'user'; content: string }> {
  const truncated = plainText.slice(0, 6000);

  return [
    { role: 'system' as const, content: SUMMARIZATION_PROMPT },
    {
      role: 'user' as const,
      content: `Document Title: ${document.title}
Document Type: ${document.documentType}
Author: ${document.authorName}
Tags: ${document.tags.join(', ') || 'none'}
Category: ${document.categoryName || 'uncategorized'}

---

${truncated}`,
    },
  ];
}

interface ParsedSummary {
  summary: string;
  keyTopics: string[];
  audience: string;
  complexity: 'basic' | 'intermediate' | 'advanced';
}

function parseSummaryResponse(raw: string): ParsedSummary {
  const cleaned = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      keyTopics: Array.isArray(parsed.keyTopics) ? parsed.keyTopics.filter((t: unknown) => typeof t === 'string') : [],
      audience: typeof parsed.audience === 'string' ? parsed.audience : 'All employees',
      complexity: ['basic', 'intermediate', 'advanced'].includes(parsed.complexity) ? parsed.complexity : 'basic',
    };
  } catch {
    return {
      summary: raw.slice(0, 500),
      keyTopics: [],
      audience: 'All employees',
      complexity: 'basic',
    };
  }
}

async function callGroq(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<string> {
  return generateGroqCompletion(messages, { maxTokens: 800 });
}

async function callGemini(document: KHDocument, plainText: string): Promise<string> {
  const context = `Document Title: ${document.title}\nDocument Type: ${document.documentType}\n\n${plainText.slice(0, 6000)}`;
  return generateGeminiAnswer(SUMMARIZATION_PROMPT, context);
}

export async function summarizeDocument(document: KHDocument): Promise<DocumentSummary> {
  const rawContent = document.plainText || document.content || '';
  const plainText = stripHtml(rawContent);
  const contentHash = hashContent(plainText);

  if (!plainText || plainText.trim().length < 50) {
    return {
      documentId: document.id,
      summary: document.title,
      keyTopics: document.tags.length > 0 ? document.tags : [document.documentType],
      audience: 'All employees',
      complexity: 'basic',
      lastSummarizedAt: new Date().toISOString(),
      contentHash,
    };
  }

  const messages = buildPromptMessages(document, plainText);
  let raw: string | null = null;

  try {
    raw = await callGroq(messages);
    console.log(`[Summarizer] Groq completed for "${document.title}"`);
  } catch (groqErr) {
    console.warn(`[Summarizer] Groq failed for "${document.title}":`, groqErr instanceof Error ? groqErr.message : groqErr);
    try {
      raw = await callGemini(document, plainText);
      console.log(`[Summarizer] Gemini fallback completed for "${document.title}"`);
    } catch (geminiErr) {
      console.error(`[Summarizer] Both providers failed for "${document.title}":`, geminiErr instanceof Error ? geminiErr.message : geminiErr);
    }
  }

  if (!raw) {
    return {
      documentId: document.id,
      summary: `${document.title} — a ${document.documentType} document.`,
      keyTopics: document.tags.length > 0 ? document.tags : [document.documentType],
      audience: 'All employees',
      complexity: 'basic',
      lastSummarizedAt: new Date().toISOString(),
      contentHash,
    };
  }

  const parsed = parseSummaryResponse(raw);

  return {
    documentId: document.id,
    summary: parsed.summary || document.title,
    keyTopics: parsed.keyTopics.length > 0 ? parsed.keyTopics : (document.tags.length > 0 ? document.tags : [document.documentType]),
    audience: parsed.audience,
    complexity: parsed.complexity,
    lastSummarizedAt: new Date().toISOString(),
    contentHash,
  };
}

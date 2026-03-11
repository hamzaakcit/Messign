import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

interface AvailableField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'enum';
  values?: string[];
}

router.post('/parse-filters', async (req: Request, res: Response) => {
  const { query: nlQuery, availableFields, module } = req.body as {
    query?: string;
    availableFields?: AvailableField[];
    module?: string;
  };

  if (!nlQuery || typeof nlQuery !== 'string' || !nlQuery.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }
  if (!availableFields || !Array.isArray(availableFields) || availableFields.length === 0) {
    return res.status(400).json({ error: 'availableFields is required' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.json({ filters: {}, interpretation: 'AI filter parsing unavailable (no API key configured)' });
  }

  const fieldsDescription = availableFields
    .map(f => {
      let desc = `${f.key} (${f.label}, type: ${f.type})`;
      if (f.values?.length) desc += ` — allowed values: ${f.values.join(', ')}`;
      return desc;
    })
    .join('\n');

  const prompt = `You are a filter parser for a ${module || 'business'} application.
Parse the following natural language query into structured filters.

Available fields:
${fieldsDescription}

User query: "${nlQuery}"

Return ONLY valid JSON with this shape:
{
  "filters": { "<field_key>": <value>, ... },
  "interpretation": "human-readable summary of what filters were applied"
}

Rules:
- Use only field keys from the available fields list.
- For date ranges, use keys like "<field>From" and "<field>To" with ISO date strings (YYYY-MM-DD).
- For numeric ranges, use keys like "<field>Min" and "<field>Max".
- For "last month" / "this quarter" etc., compute actual date ranges relative to today (${new Date().toISOString().split('T')[0]}).
- For enum fields, match the user's intent to the closest allowed value.
- If you cannot parse a meaningful filter, return empty filters with an interpretation explaining why.
- Return ONLY the JSON object, no markdown, no explanation.`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a precise JSON filter parser. Respond with valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.error('[NLFilter] Groq API error:', response.status);
      return res.json({ filters: {}, interpretation: 'Failed to parse filters — please try rephrasing' });
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? '{}';

    let parsed: { filters?: Record<string, unknown>; interpretation?: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      return res.json({ filters: {}, interpretation: 'Failed to parse AI response' });
    }

    const validKeys = new Set(availableFields.map(f => f.key));
    const validFilters: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed.filters ?? {})) {
      const baseKey = key.replace(/(Min|Max|From|To)$/, '');
      if (validKeys.has(key) || validKeys.has(baseKey)) {
        validFilters[key] = value;
      }
    }

    return res.json({
      filters: validFilters,
      interpretation: parsed.interpretation ?? 'Filters applied',
    });
  } catch (err) {
    console.error('[NLFilter] Error:', err);
    return res.json({ filters: {}, interpretation: 'Filter parsing temporarily unavailable' });
  }
});

export default router;

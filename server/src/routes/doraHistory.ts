/**
 * Dora Conversation History API
 *
 * POST   /api/dora/sessions           — Create a new session
 * GET    /api/dora/sessions           — List sessions for current user
 * DELETE /api/dora/sessions/:id       — Delete a session
 * POST   /api/dora/sessions/:id/messages — Append a message to a session
 * GET    /api/dora/sessions/:id/messages — Get all messages in a session
 * PATCH  /api/dora/sessions/:id/title — Update session title
 */

import { Router } from 'express';
import { query } from '../db/index.js';

export const doraHistoryRouter = Router();

const MAX_SESSIONS = 50;
const MAX_SESSION_TITLE = 120;

function getUserId(req: any): string | null {
  return req.userId ?? req.user?.id ?? null;
}

// ── Create session ───────────────────────────────────────────────
doraHistoryRouter.post('/sessions', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { title } = req.body;
  const safeTitle = typeof title === 'string'
    ? title.slice(0, MAX_SESSION_TITLE)
    : 'New conversation';

  try {
    const result = await query<{ id: string; title: string; created_at: string }>(
      `INSERT INTO dora_sessions (user_id, title) VALUES ($1, $2)
       RETURNING id, title, created_at`,
      [userId, safeTitle],
    );

    // Prune old sessions beyond limit
    await query(
      `DELETE FROM dora_sessions
       WHERE user_id = $1 AND id NOT IN (
         SELECT id FROM dora_sessions WHERE user_id = $1
         ORDER BY updated_at DESC LIMIT $2
       )`,
      [userId, MAX_SESSIONS],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[doraHistory] create session error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// ── List sessions ────────────────────────────────────────────────
doraHistoryRouter.get('/sessions', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const result = await query<{
      id: string;
      title: string;
      created_at: string;
      updated_at: string;
      message_count: string;
    }>(
      `SELECT ds.id, ds.title, ds.created_at, ds.updated_at,
              COUNT(dm.id)::text AS message_count
       FROM dora_sessions ds
       LEFT JOIN dora_messages dm ON dm.session_id = ds.id
       WHERE ds.user_id = $1
       GROUP BY ds.id
       ORDER BY ds.updated_at DESC
       LIMIT $2`,
      [userId, MAX_SESSIONS],
    );

    res.json({ sessions: result.rows });
  } catch (err) {
    console.error('[doraHistory] list sessions error:', err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

// ── Delete session ───────────────────────────────────────────────
doraHistoryRouter.delete('/sessions/:id', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    await query(
      `DELETE FROM dora_sessions WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[doraHistory] delete session error:', err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// ── Append messages to session ───────────────────────────────────
doraHistoryRouter.post('/sessions/:id/messages', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: 'messages array required' });
    return;
  }

  try {
    // Verify ownership
    const owns = await query(
      `SELECT id FROM dora_sessions WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId],
    );
    if (owns.rowCount === 0) { res.status(404).json({ error: 'Session not found' }); return; }

    for (const msg of messages) {
      if (!['user', 'assistant'].includes(msg.role)) continue;
      await query(
        `INSERT INTO dora_messages (session_id, role, content, metadata)
         VALUES ($1, $2, $3, $4)`,
        [req.params.id, msg.role, (msg.content ?? '').slice(0, 20000), msg.metadata ?? null],
      );
    }

    // Update session's updated_at
    await query(
      `UPDATE dora_sessions SET updated_at = NOW() WHERE id = $1`,
      [req.params.id],
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('[doraHistory] append messages error:', err);
    res.status(500).json({ error: 'Failed to save messages' });
  }
});

// ── Get session messages ─────────────────────────────────────────
doraHistoryRouter.get('/sessions/:id/messages', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  try {
    const owns = await query(
      `SELECT id FROM dora_sessions WHERE id = $1 AND user_id = $2`,
      [req.params.id, userId],
    );
    if (owns.rowCount === 0) { res.status(404).json({ error: 'Session not found' }); return; }

    const result = await query<{
      id: string;
      role: string;
      content: string;
      metadata: unknown;
      created_at: string;
    }>(
      `SELECT id, role, content, metadata, created_at
       FROM dora_messages WHERE session_id = $1
       ORDER BY created_at ASC`,
      [req.params.id],
    );

    res.json({ messages: result.rows });
  } catch (err) {
    console.error('[doraHistory] get messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ── Update session title ─────────────────────────────────────────
doraHistoryRouter.patch('/sessions/:id/title', async (req, res) => {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

  const { title } = req.body;
  if (typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ error: 'title required' });
    return;
  }

  try {
    await query(
      `UPDATE dora_sessions SET title = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
      [title.slice(0, MAX_SESSION_TITLE), req.params.id, userId],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[doraHistory] update title error:', err);
    res.status(500).json({ error: 'Failed to update title' });
  }
});

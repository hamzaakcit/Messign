import { Request, Response, NextFunction } from 'express';
import { query } from '../db/index.js';

type AuthReq = Request & { userId: string; knowledgeRole?: string };

export function requireKnowledgeRole(...allowedRoles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as AuthReq).userId;
    if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const result = await query<{ role: string }>(
      'SELECT role FROM knowledge_user_roles WHERE user_id = $1',
      [userId]
    );
    const userRole = result.rows[0]?.role || 'viewer';
    (req as AuthReq).knowledgeRole = userRole;

    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

export async function canAccessDocument(userId: string, documentId: string): Promise<boolean> {
  const result = await query(
    `SELECT d.id FROM knowledge_documents d
     WHERE d.id = $1 AND (
       d.is_public = true
       OR d.author_id = $2
       OR EXISTS (
         SELECT 1 FROM knowledge_team_access ta
         JOIN knowledge_team_members tm ON tm.team_id = ta.team_id
         WHERE ta.document_id = d.id AND tm.user_id = $2
       )
       OR EXISTS (
         SELECT 1 FROM knowledge_user_roles r
         WHERE r.user_id = $2 AND r.role IN ('admin', 'cpo')
       )
     )`,
    [documentId, userId]
  );
  return result.rows.length > 0;
}

export async function getKnowledgeRole(userId: string): Promise<string> {
  const result = await query<{ role: string }>(
    'SELECT role FROM knowledge_user_roles WHERE user_id = $1',
    [userId]
  );
  return result.rows[0]?.role || 'viewer';
}

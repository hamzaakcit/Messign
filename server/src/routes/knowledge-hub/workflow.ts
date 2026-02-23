import { Router, Request, Response } from 'express';
import * as db from '../../db/knowledgeV2Db.js';

export const workflowRouter = Router();
type AuthReq = Request & { userId: string };

const TRANSITIONS: Record<string, string[]> = {
  draft: ['in_review'],
  in_review: ['published', 'rejected'],
  published: ['archived'],
  archived: ['draft'],
  rejected: ['draft'],
};

async function transition(req: Request, res: Response, targetStatus: string, actionType?: string) {
  try {
    const userId = (req as AuthReq).userId;
    const doc = await db.getDocumentById(req.params.id);
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }

    const allowed = TRANSITIONS[doc.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      res.status(400).json({ error: `Cannot transition from ${doc.status} to ${targetStatus}` });
      return;
    }

    const updated = await db.updateDocument(doc.id, { status: targetStatus });

    if (targetStatus === 'published' && doc.content) {
      await db.createVersion(doc.id, doc.content, doc.plain_text, userId, 'Auto-versioned on publish');
    }

    if (actionType) {
      await db.createReviewAction({ documentId: doc.id, reviewerId: userId, action: actionType, comment: req.body?.comment });
    }

    const io = req.app.get('io');
    if (io) io.emit('kh:status-changed', { documentId: doc.id, status: targetStatus });

    const notifType = targetStatus === 'published' ? 'document_approved'
      : targetStatus === 'rejected' ? 'document_rejected'
      : targetStatus === 'in_review' ? 'review_requested' : null;

    if (notifType) {
      const recipientId = targetStatus === 'in_review' ? undefined : doc.author_id;
      if (recipientId && recipientId !== userId) {
        await db.createNotification({
          userId: recipientId,
          type: notifType,
          title: `Document ${targetStatus === 'published' ? 'Approved' : targetStatus === 'rejected' ? 'Rejected' : 'Status Changed'}`,
          message: `"${doc.title}" has been ${targetStatus.replace('_', ' ')}`,
          link: `/knowledge-hub/documents/${doc.slug}`,
          relatedDocumentId: doc.id,
        });
      }
    }

    await db.logAudit({ userId, action: `workflow_${targetStatus}`, entityType: 'document', entityId: doc.id });
    res.json(updated);
  } catch (e) {
    console.error('[kh-workflow]:', e);
    res.status(500).json({ error: 'Workflow transition failed' });
  }
}

workflowRouter.post('/:id/submit-review', (req, res) => transition(req, res, 'in_review'));
workflowRouter.post('/:id/approve', (req, res) => transition(req, res, 'published', 'approved'));
workflowRouter.post('/:id/reject', (req, res) => transition(req, res, 'rejected', 'rejected'));
workflowRouter.post('/:id/request-changes', (req, res) => transition(req, res, 'rejected', 'requested_changes'));
workflowRouter.post('/:id/archive', (req, res) => transition(req, res, 'archived'));
workflowRouter.post('/:id/restore', (req, res) => transition(req, res, 'draft'));

workflowRouter.get('/:id/actions', async (req: Request, res: Response) => {
  try {
    const actions = await db.listReviewActions(req.params.id);
    res.json(actions);
  } catch (e) {
    console.error('[kh-workflow] actions:', e);
    res.status(500).json({ error: 'Failed to list actions' });
  }
});

workflowRouter.get('/pending', async (req: Request, res: Response) => {
  try {
    const result = await db.listDocuments({ status: 'in_review', limit: 50 });
    res.json(result.docs);
  } catch (e) {
    console.error('[kh-workflow] pending:', e);
    res.status(500).json({ error: 'Failed to list pending reviews' });
  }
});

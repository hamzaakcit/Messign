import { Router, type Request } from 'express';
import type { Server } from 'socket.io';
import { requireAdmin } from '../../middleware/adminAuth.js';

function getIo(req: Request): Server | undefined {
  return req.app.get('io') as Server | undefined;
}

const router = Router();
router.use(requireAdmin);

router.post('/send', (req, res) => {
  try {
    const { recipientId, subject, content, type } = req.body as {
      recipientId?: string;
      subject?: string;
      content?: string;
      type?: string;
    };
    if (!recipientId || !subject || !content) {
      res.status(400).json({ error: 'recipientId, subject, and content are required' });
      return;
    }
    getIo(req)?.emit('notification:new', {
      userId: recipientId,
      type: type ?? 'admin_message',
      title: subject,
      message: content,
      timestamp: new Date().toISOString(),
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export const adminMessagesRouter = router;

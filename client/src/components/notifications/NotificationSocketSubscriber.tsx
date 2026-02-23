import { useEffect } from 'react';
import { toast } from 'sonner';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';
import { useNotificationStore, type NotificationType } from '@/stores/notificationStore';

/**
 * Subscribes to notification:new, xp:updated, and knowledge hub events
 * so the current user receives notifications and toasts whether they're
 * on the workspace or admin panel.
 * Mount this when user is logged in (e.g. in App.tsx).
 */
export function NotificationSocketSubscriber() {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);

  useEffect(() => {
    if (!user?.id) return;

    const socket = getSocket();

    const handleXPUpdated = (data: {
      userId: string;
      newXP: number;
      xpAmount: number;
      reason?: string;
    }) => {
      if (data.userId !== user.id) return;
      updateUser({ xp: data.newXP });
      const sign = data.xpAmount >= 0 ? '+' : '';
      toast.success(`MP updated: ${sign}${data.xpAmount} (Total: ${data.newXP})`);
      useNotificationStore.getState().addNotification({
        type: 'xp_awarded',
        title: 'MP Awarded',
        message: data.reason ?? 'You received MP',
        metadata: { xpAmount: data.xpAmount },
        actionUrl: '/dashboard',
        actionLabel: 'View Dashboard',
      });
    };

    const handleNotificationNew = (data: {
      userId: string;
      type?: string;
      title?: string;
      message?: string;
      actionUrl?: string;
      actionLabel?: string;
    }) => {
      if (data.userId !== user.id) return;
      const notifType = (data.type ?? 'admin_message') as NotificationType;

      if (notifType === 'reimbursement_approved' || notifType === 'reimbursement_rejected') {
        toast[notifType === 'reimbursement_approved' ? 'success' : 'error'](
          data.title ? (
            <div>
              <div className="font-semibold">{data.title}</div>
              {data.message && <div className="text-sm opacity-90">{data.message}</div>}
            </div>
          ) : (
            (data.message ?? (notifType === 'reimbursement_approved' ? 'Your reimbursement was approved.' : 'Your reimbursement was rejected.'))
          ),
          { duration: 10000 }
        );
        useNotificationStore.getState().addNotification({
          type: notifType,
          title: data.title ?? (notifType === 'reimbursement_approved' ? 'Reimbursement approved' : 'Reimbursement rejected'),
          message: data.message ?? '',
          actionUrl: data.actionUrl ?? '/reimbursements',
          actionLabel: data.actionLabel ?? 'View',
        });
        return;
      }

      // Knowledge hub targeted notifications (flag resolved)
      if (notifType === 'knowledge_flag_resolved') {
        toast.info(
          <div>
            <div className="font-semibold">{data.title ?? 'Flag resolved'}</div>
            {data.message && <div className="text-sm opacity-90">{data.message}</div>}
          </div>,
          { duration: 8000 }
        );
        useNotificationStore.getState().addNotification({
          type: 'knowledge_flag_resolved',
          title: data.title ?? 'Flag resolved',
          message: data.message ?? '',
          actionUrl: data.actionUrl ?? '/knowledge',
          actionLabel: data.actionLabel ?? 'View',
        });
        return;
      }

      if (notifType !== 'admin_message' && notifType !== 'admin_announcement') return;

      toast.info(
        data.title ? (
          <div>
            <div className="font-semibold">{data.title}</div>
            {data.message && <div className="text-sm opacity-90">{data.message}</div>}
          </div>
        ) : (
          (data.message ?? 'New notification')
        ),
        { duration: 10000 }
      );
      useNotificationStore.getState().addNotification({
        type: 'admin_message',
        title: data.title ?? 'Message from Admin',
        message: data.message ?? '',
        actionUrl: '/chat',
        actionLabel: 'View Message',
      });
    };

    /* ── Knowledge Hub broadcast events ── */
    const handleNewDocument = (data: { document: { id: string; title: string; slug: string } }) => {
      toast.info(
        <div>
          <div className="font-semibold">New document published</div>
          <div className="text-sm opacity-90">{data.document.title}</div>
        </div>,
        { duration: 6000 }
      );
      useNotificationStore.getState().addNotification({
        type: 'knowledge_new_document',
        title: 'New document',
        message: `"${data.document.title}" has been published.`,
        actionUrl: `/knowledge/${data.document.slug}`,
        actionLabel: 'Read',
      });
    };

    const handleDocumentUpdated = (data: { document: { id: string; title: string; slug: string } }) => {
      toast.info(
        <div>
          <div className="font-semibold">Document updated</div>
          <div className="text-sm opacity-90">{data.document.title}</div>
        </div>,
        { duration: 5000 }
      );
    };

    const handleRequiredReading = (data: { document: { id: string; title: string; slug: string } }) => {
      toast.warning(
        <div>
          <div className="font-semibold">New required reading</div>
          <div className="text-sm opacity-90">{data.document.title}</div>
        </div>,
        { duration: 10000 }
      );
      useNotificationStore.getState().addNotification({
        type: 'knowledge_required_reading',
        title: 'Required reading',
        message: `"${data.document.title}" requires your acknowledgement.`,
        actionUrl: `/knowledge/${data.document.slug}`,
        actionLabel: 'Read & Acknowledge',
      });
    };

    const handleFlagCreated = (data: { documentId: string; title: string; reason: string }) => {
      // Only admins would care, but since it's broadcast, show to all
      toast.info(
        <div>
          <div className="font-semibold">Document flagged</div>
          <div className="text-sm opacity-90">"{data.title}" — {data.reason}</div>
        </div>,
        { duration: 5000 }
      );
    };

    socket.on('xp:updated', handleXPUpdated);
    socket.on('notification:new', handleNotificationNew);
    socket.on('knowledge:new_document', handleNewDocument);
    socket.on('knowledge:document_updated', handleDocumentUpdated);
    socket.on('knowledge:required_reading', handleRequiredReading);
    socket.on('knowledge:flag_created', handleFlagCreated);

    return () => {
      socket.off('xp:updated', handleXPUpdated);
      socket.off('notification:new', handleNotificationNew);
      socket.off('knowledge:new_document', handleNewDocument);
      socket.off('knowledge:document_updated', handleDocumentUpdated);
      socket.off('knowledge:required_reading', handleRequiredReading);
      socket.off('knowledge:flag_created', handleFlagCreated);
    };
  }, [user?.id, updateUser]);

  return null;
}

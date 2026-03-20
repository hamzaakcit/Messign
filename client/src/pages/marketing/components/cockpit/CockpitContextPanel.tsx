import { useNavigate } from 'react-router-dom';
import type { ApprovalQueueItem } from '../../approvalQueue/types';
import type { Campaign, ContentItem, Lead } from '@/lib/marketingApi';
import type { SelectedItem } from './cockpitTypes';
import { CampaignDetailPanel } from './CampaignDetailPanel';
import { ContentDetailPanel } from './ContentDetailPanel';
import { EmptyContextPanel } from './EmptyContextPanel';
import { LeadDetailPanel } from './LeadDetailPanel';

export function CockpitContextPanel({
  userId,
  selectedItem,
  approvalSnapshot,
  campaigns,
  contentList,
  leadsList,
  onClose,
  onDataChanged,
  onAskDora,
}: {
  userId: string;
  selectedItem: SelectedItem | null;
  approvalSnapshot: ApprovalQueueItem | null;
  campaigns: Campaign[];
  contentList: ContentItem[];
  leadsList: Lead[];
  onClose: () => void;
  onDataChanged: () => void | Promise<void>;
  onAskDora: (prompt: string) => void;
}) {
  const navigate = useNavigate();

  if (!selectedItem) {
    return <EmptyContextPanel />;
  }

  if (selectedItem.type === 'content') {
    return (
      <ContentDetailPanel
        userId={userId}
        contentId={selectedItem.id}
        initialApprovalId={null}
        gatekeeperSnapshot={null}
        onClose={onClose}
        onDataChanged={onDataChanged}
      />
    );
  }

  if (selectedItem.type === 'approval') {
    return (
      <ContentDetailPanel
        userId={userId}
        contentId={selectedItem.contentId}
        initialApprovalId={selectedItem.id}
        gatekeeperSnapshot={approvalSnapshot}
        onClose={onClose}
        onDataChanged={onDataChanged}
      />
    );
  }

  if (selectedItem.type === 'campaign') {
    const campaign = campaigns.find((c) => c.id === selectedItem.id);
    if (!campaign) {
      return (
        <div className="flex h-full items-center justify-center p-4 text-[11px] text-slate-500">
          Campaign not found in the loaded list.
        </div>
      );
    }
    const linked = contentList.filter((c) => c.campaign_id === campaign.id);
    return (
      <CampaignDetailPanel
        campaign={campaign}
        linkedContent={linked}
        onClose={onClose}
        onOpenFull={() => navigate('/marketing/campaigns')}
        onAskDora={onAskDora}
      />
    );
  }

  if (selectedItem.type === 'lead') {
    const lead = leadsList.find((l) => l.id === selectedItem.id);
    if (!lead) {
      return (
        <div className="flex h-full items-center justify-center p-4 text-[11px] text-slate-500">
          Lead not found in the loaded list.
        </div>
      );
    }
    return (
      <LeadDetailPanel lead={lead} onClose={onClose} onOpenFull={() => navigate('/marketing/leads')} />
    );
  }

  return <EmptyContextPanel />;
}

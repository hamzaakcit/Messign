import { Button } from '@/components/ui';
import { Users, Shield, Trophy, Mail, Download, Trash2 } from 'lucide-react';

interface BulkActionToolbarProps {
  selectedCount: number;
  onChangeDepartment?: () => void;
  onChangeRole?: () => void;
  onAdjustXP?: () => void;
  onAwardBadge?: () => void;
  onSendMessage?: () => void;
  onExport?: () => void;
  onDelete?: () => void;
  onClearSelection?: () => void;
}

export function BulkActionToolbar({
  selectedCount,
  onClearSelection,
  onChangeDepartment,
  onChangeRole,
  onAdjustXP,
  onAwardBadge,
  onSendMessage,
  onExport,
  onDelete,
}: BulkActionToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-primary-500/10 border-b border-white/10 flex-wrap">
      <span className="text-sm font-medium text-app mr-2">
        {selectedCount} selected
      </span>
      <Button variant="secondary" size="sm" className="gap-1" onClick={onChangeDepartment}>
        <Users className="w-4 h-4" />
        Change dept
      </Button>
      <Button variant="secondary" size="sm" className="gap-1" onClick={onChangeRole}>
        <Shield className="w-4 h-4" />
        Change role
      </Button>
      <Button variant="secondary" size="sm" className="gap-1" onClick={onAdjustXP}>
        <Trophy className="w-4 h-4" />
        Adjust MP
      </Button>
      <Button variant="secondary" size="sm" className="gap-1" onClick={onAwardBadge}>
        <Trophy className="w-4 h-4" />
        Award badge
      </Button>
      <Button variant="secondary" size="sm" className="gap-1" onClick={onSendMessage}>
        <Mail className="w-4 h-4" />
        Send message
      </Button>
      <Button variant="secondary" size="sm" className="gap-1" onClick={onExport}>
        <Download className="w-4 h-4" />
        Export
      </Button>
      <Button variant="danger" size="sm" className="gap-1" onClick={onDelete}>
        <Trash2 className="w-4 h-4" />
        Delete
      </Button>
      <Button variant="ghost" size="sm" onClick={onClearSelection}>
        Clear
      </Button>
    </div>
  );
}

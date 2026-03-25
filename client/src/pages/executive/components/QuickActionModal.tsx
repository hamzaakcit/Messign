import { Modal } from '@/components/ui';
import { FinanceActions } from './actions/FinanceActions';
import { SalesActions } from './actions/SalesActions';
import { SupportActions } from './actions/SupportActions';
import { TimesheetActions } from './actions/TimesheetActions';
import { MarketingActions } from './actions/MarketingActions';
import { HRActions } from './actions/HRActions';
import { OKRActions } from './actions/OKRActions';

export type ActionDepartment = 'finance' | 'sales' | 'support' | 'time' | 'marketing' | 'hr' | 'okr' | null;

const TITLES: Record<string, string> = {
  finance: 'Finance Actions',
  sales: 'Sales Pipeline',
  support: 'Support Tickets',
  time: 'Timesheet Approvals',
  marketing: 'Marketing Campaigns',
  hr: 'Applications Review',
  okr: 'OKR Check-in',
};

interface QuickActionModalProps {
  department: ActionDepartment;
  onClose: () => void;
  onDataChanged: () => void;
  userId: string;
}

export function QuickActionModal({ department, onClose, onDataChanged, userId }: QuickActionModalProps): JSX.Element | null {
  if (!department) return null;

  const handleSuccess = (): void => {
    onDataChanged();
  };

  return (
    <Modal isOpen={!!department} onClose={onClose} title={TITLES[department] ?? 'Actions'} size="xl">
      <div className="max-h-[65vh] overflow-y-auto -mx-1 px-1">
        {department === 'finance' && <FinanceActions userId={userId} onSuccess={handleSuccess} />}
        {department === 'sales' && <SalesActions userId={userId} onSuccess={handleSuccess} />}
        {department === 'support' && <SupportActions userId={userId} onSuccess={handleSuccess} />}
        {department === 'time' && <TimesheetActions userId={userId} onSuccess={handleSuccess} />}
        {department === 'marketing' && <MarketingActions userId={userId} onSuccess={handleSuccess} />}
        {department === 'hr' && <HRActions userId={userId} onSuccess={handleSuccess} />}
        {department === 'okr' && <OKRActions userId={userId} onSuccess={handleSuccess} />}
      </div>
    </Modal>
  );
}

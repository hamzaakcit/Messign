import { useLocation, useNavigate } from 'react-router-dom';
import { ReimbursementDashboard } from './ReimbursementDashboard';
import { ReimbursementForm } from './ReimbursementForm';
import { ReimbursementDetail } from './ReimbursementDetail';
import { InvoicesPage } from './InvoicesPage';

export function ReimbursementRouter() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const segments = path.split('/').filter(Boolean);
  const base = segments[0];
  const second = segments[1];
  const third = segments[2];

  if (base !== 'reimbursements') {
    return <ReimbursementDashboard />;
  }
  if (second === undefined || second === '') {
    return <ReimbursementDashboard />;
  }
  if (second === 'invoices') {
    return <InvoicesPage />;
  }
  if (second === 'new') {
    return <ReimbursementForm onSuccess={(id) => navigate(`/reimbursements/${id}`)} onCancel={() => navigate('/reimbursements')} />;
  }
  if (second && third === 'edit') {
    return (
      <ReimbursementForm
        id={second}
        onSuccess={(id) => navigate(`/reimbursements/${id}`)}
        onCancel={() => navigate(`/reimbursements/${second}`)}
      />
    );
  }
  if (second) {
    return <ReimbursementDetail id={second} />;
  }

  return <ReimbursementDashboard />;
}

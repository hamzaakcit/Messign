import { useLocation } from 'react-router-dom';
import { ContractsPage } from './ContractsPage';

export function ContractsLayout() {
  const location = useLocation();
  const segment = location.pathname.split('/').filter(Boolean)[1];
  return <ContractsPage initialTab={segment === 'renewals' ? 'renewals' : segment === 'obligations' ? 'obligations' : segment === 'dashboard' ? 'dashboard' : 'contracts'} />;
}

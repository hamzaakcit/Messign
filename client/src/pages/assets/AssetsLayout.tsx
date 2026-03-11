import { useLocation } from 'react-router-dom';
import { AssetsPage } from './AssetsPage';

export function AssetsLayout() {
  const location = useLocation();
  const segment = location.pathname.split('/').filter(Boolean)[1];
  return <AssetsPage initialTab={segment === 'licenses' ? 'licenses' : segment === 'dashboard' ? 'dashboard' : 'equipment'} />;
}

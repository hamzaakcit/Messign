import { useLocation } from 'react-router-dom';
import { CustomersPage } from './CustomersPage';
import { CustomerDetailPage } from './CustomerDetailPage';

/** /customers is the list, /customers/:id one customer's trail (the shell routes by path, not nested routes). */
export function CustomersView(): JSX.Element {
  const { pathname } = useLocation();
  const id = /^\/customers\/([^/]+)\/?$/.exec(pathname)?.[1];
  return id ? <CustomerDetailPage key={id} id={decodeURIComponent(id)} /> : <CustomersPage />;
}

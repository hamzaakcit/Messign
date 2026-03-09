import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { CRMNav } from '@/components/crm/CRMNav';
import { DoraInsightBar } from '@/components/dora/DoraInsightBar';
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import { SlideOverPanel } from '@/components/ui/SlideOverPanel';
import { ContactDetailPanel } from '@/components/crm/ContactDetailPanel';
import { ContactCreatePanel } from '@/components/crm/ContactCreatePanel';
import { crmAPI, type Contact } from '@/lib/crmApi';

const columns: ColumnDef<Contact>[] = [
  {
    key: 'first_name',
    header: 'Name',
    sortable: true,
    render: (_v, row) => (
      <span className="font-medium text-app-text">
        {row.first_name} {row.last_name ?? ''}
      </span>
    ),
  },
  { key: 'email', header: 'Email', sortable: true },
  { key: 'company_name', header: 'Company', sortable: true },
  { key: 'job_title', header: 'Job Title' },
  { key: 'source', header: 'Source', sortable: true },
  {
    key: 'last_contacted_at',
    header: 'Last Contacted',
    sortable: true,
    render: (v) =>
      v ? new Date(v).toLocaleDateString() : <span className="text-app-muted">—</span>,
  },
];

export function CRMContactsPage() {
  const { user } = useAuthStore();
  const userId = user?.authUserId || user?.id || '';

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchContacts = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await crmAPI.listContacts(userId, { page: String(page + 1), pageSize: '20' });
      setContacts(res.data);
      setTotal(res.total);
    } catch {
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [userId, page]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const handleRowClick = (row: Contact) => {
    setSelectedContactId(row.id);
  };

  const handleCreated = () => {
    setCreateOpen(false);
    fetchContacts();
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-6 pt-6 pb-4 flex flex-col min-h-full">
          <CRMNav />
          <DoraInsightBar module="sales" />

          <div className="flex items-center justify-between mb-4 mt-4">
            <h2 className="text-lg font-semibold text-app-text">Contacts</h2>
            <button
              onClick={() => setCreateOpen(true)}
              className="px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New Contact
            </button>
          </div>

          <DataTable
            data={contacts}
            columns={columns}
            isLoading={loading}
            onRowClick={handleRowClick}
            sortable
            searchable
            searchPlaceholder="Search contacts…"
            pagination
            pageSize={20}
            totalItems={total}
            currentPage={page}
            onPageChange={setPage}
            emptyMessage="No contacts yet. Create your first contact to get started."
          />
        </div>
      </div>

      <SlideOverPanel
        isOpen={!!selectedContactId}
        onClose={() => setSelectedContactId(null)}
        title="Contact Details"
        width={560}
      >
        {selectedContactId && (
          <ContactDetailPanel
            contactId={selectedContactId}
            onUpdated={fetchContacts}
          />
        )}
      </SlideOverPanel>

      <SlideOverPanel
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Contact"
        width={480}
      >
        <ContactCreatePanel onCreated={handleCreated} onCancel={() => setCreateOpen(false)} />
      </SlideOverPanel>
    </div>
  );
}

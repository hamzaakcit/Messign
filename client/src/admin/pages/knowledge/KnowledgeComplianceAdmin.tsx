import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { adminKnowledgeAPI } from '@/lib/api';
import { toast } from 'sonner';
import { FileText, CheckCircle, Clock, AlertTriangle, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComplianceDoc {
  documentId: string; title: string; requiredForRoles: string[];
  totalUsers: number; acknowledged: number; pending: number; compliancePercent: number;
}

interface ComplianceData {
  totalRequired: number; fullyAcknowledged: number; totalPending: number;
  overallRate: number; documents: ComplianceDoc[];
}

interface Ack { id: string; user_id: string; user_name?: string; acknowledged_at: string; }

export function KnowledgeComplianceAdmin() {
  const { user } = useAuthStore();
  const userId = user?.id ?? '';
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [acks, setAcks] = useState<Ack[]>([]);
  const [acksLoading, setAcksLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    adminKnowledgeAPI.compliance.get(userId).then(d => setData(d as ComplianceData)).catch(() => toast.error('Failed to load')).finally(() => setLoading(false));
  }, [userId]);

  const toggleExpand = async (docId: string) => {
    if (expandedDoc === docId) { setExpandedDoc(null); return; }
    setExpandedDoc(docId);
    setAcksLoading(true);
    try {
      const list = await adminKnowledgeAPI.compliance.acknowledgements(userId, docId);
      setAcks(list as Ack[]);
    } catch { setAcks([]); }
    setAcksLoading(false);
  };

  if (loading) return <div className="p-12 text-center text-app-muted">Loading...</div>;
  if (!data) return <div className="p-12 text-center text-app-muted">No data available.</div>;

  return (
    <div className="p-6 space-y-6 bg-app min-h-full">
      <h1 className="text-2xl font-bold text-app">Knowledge Hub — Compliance Tracker</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Required Docs" value={data.totalRequired} icon={<FileText className="w-5 h-5 text-blue-400" />} color="blue" />
        <StatCard label="Fully Acknowledged" value={data.fullyAcknowledged} icon={<CheckCircle className="w-5 h-5 text-emerald-400" />} color="emerald" />
        <StatCard label="Pending Acknowledgements" value={data.totalPending} icon={<Clock className="w-5 h-5 text-amber-400" />} color="amber" />
        <StatCard label="Compliance Rate" value={`${data.overallRate}%`} icon={<AlertTriangle className="w-5 h-5 text-purple-400" />} color="purple" />
      </div>

      {/* Per-Document Table */}
      <div className="rounded-xl border border-app-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-app-card text-app-muted text-xs uppercase tracking-wider">
              <th className="text-left py-3 px-4">Document</th>
              <th className="text-right py-3 px-3">Total Users</th>
              <th className="text-right py-3 px-3">Acknowledged</th>
              <th className="text-right py-3 px-3">Pending</th>
              <th className="text-right py-3 px-3">Compliance</th>
              <th className="text-right py-3 px-4">Details</th>
            </tr>
          </thead>
          <tbody>
            {data.documents.map(doc => (
              <>
                <tr key={doc.documentId} className="border-t border-app-border hover:bg-app-hover/50">
                  <td className="py-3 px-4 font-medium text-app">{doc.title}</td>
                  <td className="py-3 px-3 text-right text-app-muted">{doc.totalUsers}</td>
                  <td className="py-3 px-3 text-right text-emerald-400">{doc.acknowledged}</td>
                  <td className="py-3 px-3 text-right text-amber-400">{doc.pending}</td>
                  <td className="py-3 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-2 bg-app-hover rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', doc.compliancePercent >= 80 ? 'bg-emerald-500' : doc.compliancePercent >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                          style={{ width: `${doc.compliancePercent}%` }} />
                      </div>
                      <span className="text-xs font-medium text-app-muted">{doc.compliancePercent}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button onClick={() => toggleExpand(doc.documentId)} className="p-1.5 rounded text-app-muted hover:text-app hover:bg-app-hover">
                      {expandedDoc === doc.documentId ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </td>
                </tr>
                {expandedDoc === doc.documentId && (
                  <tr key={`${doc.documentId}-detail`}>
                    <td colSpan={6} className="bg-app-card/50 px-8 py-4">
                      {acksLoading ? (
                        <p className="text-xs text-app-muted">Loading...</p>
                      ) : (
                        <div>
                          <p className="text-xs font-semibold text-app-muted uppercase mb-2 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Acknowledged Users</p>
                          {acks.length === 0 ? (
                            <p className="text-xs text-app-muted">No acknowledgements yet.</p>
                          ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              {acks.map(a => (
                                <div key={a.id} className="flex items-center gap-2 text-xs text-app">
                                  <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                                  <span>{a.user_name ?? a.user_id}</span>
                                  <span className="text-app-muted">{new Date(a.acknowledged_at).toLocaleDateString()}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
            {data.documents.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-app-muted">No required reading documents.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-xl border border-app-border bg-app-sidebar p-4">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-10 h-10 rounded-lg bg-${color}-500/20 flex items-center justify-center`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-app">{value}</p>
      <p className="text-xs text-app-muted mt-1">{label}</p>
    </div>
  );
}

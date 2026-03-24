import { useEffect, useState } from 'react';
import { Users, Plus, Trash2 } from 'lucide-react';
import { khTeamsAPI } from '@/lib/knowledge-hub/api';
import type { KhTeam } from '@/types/knowledge-hub';
import { toast } from 'sonner';

export function AdminTeamsPage() {
  const [teams, setTeams] = useState<KhTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');

  const fetchTeams = () => {
    khTeamsAPI.list().then(setTeams).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { fetchTeams(); }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await khTeamsAPI.create({ name: newName, description: newDesc || undefined, color: newColor });
      toast.success('Team created');
      setShowNew(false);
      setNewName(''); setNewDesc(''); setNewColor('#3b82f6');
      fetchTeams();
    } catch { toast.error('Failed to create team'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this team?')) return;
    try {
      await khTeamsAPI.delete(id);
      toast.success('Team deleted');
      fetchTeams();
    } catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-app-text flex items-center gap-2"><Users className="w-5 h-5 text-cyan-400" /> Knowledge Teams</h1>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-primary-500 text-app-text hover:bg-primary-600">
          <Plus className="w-4 h-4" /> New Team
        </button>
      </div>

      {showNew && (
        <div className="mb-6 p-4 rounded-xl bg-app-sidebar border border-app-border space-y-3">
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Team name..." className="w-full px-3 py-2 rounded-lg bg-app-card border border-app-border text-sm text-app-text" autoFocus />
          <textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description..." className="w-full px-3 py-2 rounded-lg bg-app-card border border-app-border text-sm text-app-text resize-none h-16" />
          <div className="flex items-center gap-3">
            <label className="text-xs text-app-muted">Color:</label>
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} className="px-3 py-1.5 rounded-lg text-sm bg-primary-500 text-app-text">Create</button>
            <button onClick={() => setShowNew(false)} className="px-3 py-1.5 rounded-lg text-sm bg-app-card text-gray-300">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-app-muted">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.map(team => (
            <div key={team.id} className="p-4 rounded-xl bg-app-sidebar border border-app-border">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {team.color && <span className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />}
                  <h3 className="text-sm font-medium text-app-text">{team.name}</h3>
                </div>
                <button onClick={() => handleDelete(team.id)} className="p-1 rounded text-app-muted hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {team.description && <p className="text-xs text-app-muted mt-1">{team.description}</p>}
              <div className="text-xs text-app-muted mt-2"><Users className="w-3 h-3 inline mr-1" />{team.member_count ?? 0} members</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

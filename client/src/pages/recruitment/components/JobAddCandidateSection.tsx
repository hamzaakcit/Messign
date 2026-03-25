import { useState } from 'react';
import { toast } from 'sonner';
import { useDebouncedCallback } from '@/hooks';
import { recruitmentAPI, type RecruitmentCandidate } from '@/lib/recruitmentApi';

interface JobAddCandidateSectionProps {
  userId: string;
  jobId: string;
  onAdded: () => void;
}

/**
 * Search existing candidates and attach them to this job as a new application (pipeline entry).
 */
export function JobAddCandidateSection({ userId, jobId, onAdded }: JobAddCandidateSectionProps) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<RecruitmentCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  const runSearch = useDebouncedCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || !userId) {
      setHits([]);
      return;
    }
    setSearching(true);
    try {
      const rows = await recruitmentAPI.searchCandidates(userId, trimmed, 20);
      setHits(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Search failed');
      setHits([]);
    } finally {
      setSearching(false);
    }
  }, 300);

  const addCandidate = async (candidate: RecruitmentCandidate): Promise<void> => {
    if (!userId) return;
    setAddingId(candidate.id);
    try {
      await recruitmentAPI.createApplication(userId, {
        job_id: jobId,
        candidate_id: candidate.id,
        source: 'internal',
      });
      toast.success('Candidate added to pipeline');
      setQuery('');
      setHits([]);
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add candidate');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="rounded-xl border border-app-border bg-app-card/60 p-4 space-y-3">
      <h4 className="text-sm font-semibold text-app-text">Add candidate to pipeline</h4>
      <p className="text-xs text-app-muted">
        Search an existing candidate by name or email, then add them to this role. Duplicates are blocked if they already applied.
      </p>
      <input
        className="w-full rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm text-app-text"
        placeholder="Search candidates…"
        value={query}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          void runSearch(v);
        }}
      />
      {searching && <div className="text-xs text-app-muted">Searching…</div>}
      {hits.length > 0 && (
        <ul className="space-y-2 max-h-48 overflow-y-auto">
          {hits.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-app-border bg-app-card px-3 py-2 text-sm"
            >
              <div>
                <div className="text-app-text font-medium">
                  {c.first_name} {c.last_name || ''}
                </div>
                <div className="text-xs text-app-muted">{c.email}</div>
              </div>
              <button
                type="button"
                disabled={addingId === c.id}
                onClick={() => void addCandidate(c)}
                className="shrink-0 px-2 py-1 rounded-md text-xs font-medium bg-primary-500 text-app-text hover:bg-primary-600 disabled:opacity-50"
              >
                {addingId === c.id ? 'Adding…' : 'Add'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

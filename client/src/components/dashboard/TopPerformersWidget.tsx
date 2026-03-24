import { useState, useEffect, useCallback } from 'react';
import { Trophy, Heart, Star, Users, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { showcaseAPI } from '@/lib/api';

interface ShowcaseMember {
  user: { id: string; name: string; avatar?: string; level?: number };
}

interface ShowcaseProject {
  id: string;
  title: string;
  name?: string;
  xpReward?: number;
  department?: { name: string; color?: string };
  members?: ShowcaseMember[];
}

interface Showcase {
  id: string;
  impact_summary: string;
  project: ShowcaseProject;
  likes: number;
  is_featured?: boolean;
}

export function TopPerformersWidget() {
  const { user } = useAuthStore();
  const [showcases, setShowcases] = useState<Showcase[]>([]);

  const fetchShowcases = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await showcaseAPI.list();
      setShowcases(Array.isArray((data as { showcases?: Showcase[] }).showcases) ? (data as { showcases: Showcase[] }).showcases : []);
    } catch {
      setShowcases([]);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchShowcases();
  }, [fetchShowcases]);

  if (!user?.id) return null;

  const items = showcases.filter((s) => !s.is_featured).slice(0, 6);
  const featured = showcases.find((s) => s.is_featured);

  return (
    <div className="h-full min-h-0 flex flex-col rounded-xl border border-gray-800/50 bg-gray-900/40 backdrop-blur-md overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/50 shrink-0">
        <h2 className="text-sm font-semibold text-app flex items-center gap-2">
          <Trophy className="w-4 h-4 text-yellow-400" />
          Top Performers
        </h2>
        <a href="/projects" className="text-primary-400 hover:text-primary-300 text-xs flex items-center gap-0.5">
          View all <ChevronRight className="w-3 h-3" />
        </a>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {showcases.length === 0 ? (
          <p className="text-app-muted text-xs flex items-center gap-2 py-4">
            <Trophy className="w-4 h-4 text-app-muted/50 shrink-0" />
            No featured projects yet
          </p>
        ) : (
          <div className="space-y-2">
            {featured && (
              <a
                href="/projects"
                className="flex items-center gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 hover:border-yellow-500/40 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-yellow-500/20 shrink-0">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-app font-medium text-sm truncate">{featured.project?.title ?? featured.project?.name ?? 'Project'}</p>
                  <p className="text-app-muted text-xs truncate">{featured.impact_summary}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-app-muted">
                    <span className="flex items-center gap-0.5"><Heart className="w-3 h-3" />{featured.likes}</span>
                    <span className="flex items-center gap-0.5"><Star className="w-3 h-3 text-yellow-400" />{featured.project?.xpReward ?? 0} MP</span>
                  </div>
                </div>
              </a>
            )}
            {items.map((showcase) => (
              <a
                key={showcase.id}
                href="/projects"
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-app-nav-hover transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={showcase.project?.department?.color ? { backgroundColor: `${showcase.project.department.color}20` } : undefined}
                >
                  <Trophy className="w-4 h-4 text-yellow-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-app font-medium text-sm truncate">{showcase.project?.title ?? showcase.project?.name ?? 'Project'}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-app-muted">
                    <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{(showcase.project?.members ?? []).length}</span>
                    <span className="flex items-center gap-0.5"><Heart className="w-3 h-3" />{showcase.likes}</span>
                    <span className="flex items-center gap-0.5"><Star className="w-3 h-3 text-yellow-400" />{showcase.project?.xpReward ?? 0} MP</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

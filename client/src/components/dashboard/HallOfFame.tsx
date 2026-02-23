import { useState, useEffect, useCallback } from 'react';
import { Trophy, Heart, Star, Users, ChevronRight, Sparkles } from 'lucide-react';
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
  creator?: { id: string; name: string; avatar?: string } | null;
  members?: ShowcaseMember[];
}

interface Showcase {
  id: string;
  impact_summary: string;
  impact_metrics?: { metric: string; before: string; after: string }[];
  testimonial?: string | null;
  cover_image?: string | null;
  is_featured: boolean;
  likes: number;
  liked_by?: string[];
  project: ShowcaseProject;
}

export function HallOfFame() {
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

  const featured = showcases.find((s) => s.is_featured);
  const others = showcases.filter((s) => !s.is_featured).slice(0, 4);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-app flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-400" />
          Hall of Fame
        </h2>
        <a href="/projects" className="text-primary-400 hover:text-primary-300 text-sm flex items-center gap-1">
          View all <ChevronRight className="w-4 h-4" />
        </a>
      </div>
      {showcases.length === 0 ? (
        <div className="bg-app-card border border-app-border rounded-xl p-8 text-center">
          <Trophy className="w-12 h-12 mx-auto text-app-muted/50 mb-3" />
          <p className="text-app-muted">No featured projects yet</p>
          <p className="text-sm text-app-muted/80 mt-1">Completed projects can be showcased here.</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {featured && (
          <div className="lg:col-span-2 bg-app-card border border-yellow-500/30 rounded-xl overflow-hidden">
            {featured.cover_image && (
              <div className="h-40 overflow-hidden">
                <img src={featured.cover_image} alt={featured.project?.title ?? ''} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-yellow-400" />
                <span className="text-yellow-400 text-sm font-medium">Featured Project</span>
              </div>
              <h3 className="text-xl font-semibold text-app mb-2">{featured.project?.title ?? featured.project?.name ?? 'Project'}</h3>
              <p className="text-app-muted mb-4">{featured.impact_summary}</p>
              {featured.impact_metrics && featured.impact_metrics.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {featured.impact_metrics.slice(0, 3).map((m, i) => (
                    <div key={i} className="bg-app-surface rounded-lg p-3 text-center">
                      <p className="text-app-muted text-xs mb-1">{m.metric}</p>
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-app-muted line-through text-sm">{m.before}</span>
                        <ChevronRight className="w-3 h-3 text-green-400" />
                        <span className="text-green-400 font-semibold text-sm">{m.after}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-app-muted text-sm">Team:</span>
                  <div className="flex -space-x-2">
                    {(featured.project?.members ?? []).slice(0, 5).map((m) => (
                      <div
                        key={m.user.id}
                        className="w-8 h-8 rounded-full bg-app-surface-tertiary border-2 border-app-card flex items-center justify-center overflow-hidden"
                        title={m.user.name}
                      >
                        {m.user.avatar ? (
                          <img src={m.user.avatar} alt={m.user.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs text-app-muted">{m.user.name?.[0] ?? '?'}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <span className="flex items-center gap-1 text-pink-400 text-sm">
                  <Heart className="w-4 h-4" />
                  {featured.likes}
                </span>
              </div>
            </div>
          </div>
        )}
        <div className="space-y-3">
          {others.map((showcase) => (
            <div
              key={showcase.id}
              className="bg-app-card border border-app-border rounded-xl p-4 hover:border-yellow-500/30 transition-all cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center bg-app-surface-tertiary"
                  style={showcase.project?.department?.color ? { backgroundColor: `${showcase.project.department.color}20` } : undefined}
                >
                  <Trophy className="w-5 h-5 text-yellow-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-app font-medium truncate">{showcase.project?.title ?? showcase.project?.name ?? 'Project'}</h4>
                  <p className="text-app-muted text-sm truncate">{showcase.impact_summary}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-app-muted">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {(showcase.project?.members ?? []).length}
                    </span>
                    <span className="flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      {showcase.likes}
                    </span>
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-yellow-400" />
                      {showcase.project?.xpReward ?? 0} MP
                    </span>
                  </div>
                </div>
            </div>
          </div>
        ))}
        </div>
      </div>
      )}
    </section>
  );
}

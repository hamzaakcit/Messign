import { Link } from 'react-router-dom';
import type { CommandCenterDTO, CommandCenterDeepDiveKind } from '@/types/command-center';
import { ROUTES } from '@/lib/routes';
import { GlassSlideOver } from './GlassSlideOver';
import { TrendArea } from './charts/TrendArea';
import { TeamRadarChart } from './charts/TeamRadarChart';

interface CommandCenterDeepDiveProps {
  data: CommandCenterDTO | null;
  active: CommandCenterDeepDiveKind | null;
  onClose: () => void;
}

function titleForKind(k: CommandCenterDeepDiveKind | null): string {
  if (!k) return '';
  switch (k.kind) {
    case 'pulse_velocity':
      return 'Velocity & completions';
    case 'pulse_blockers':
      return 'Blocked work';
    case 'brain_knowledge':
      return 'Knowledge Hub';
    case 'growth_leaderboard':
      return 'XP leaderboard';
    case 'growth_radar':
      return 'Team XP radar';
    case 'future_okrs':
      return 'OKR snapshot';
    case 'future_milestones':
      return 'Strategic milestones';
    default:
      return 'Details';
  }
}

export function CommandCenterDeepDive({ data, active, onClose }: CommandCenterDeepDiveProps): JSX.Element {
  const title = titleForKind(active);

  return (
    <GlassSlideOver isOpen={active != null} onClose={onClose} title={title} width={580}>
      {data && active && <DeepBody data={data} kind={active} />}
    </GlassSlideOver>
  );
}

function DeepBody({ data, kind }: { data: CommandCenterDTO; kind: CommandCenterDeepDiveKind }): JSX.Element {
  switch (kind.kind) {
    case 'pulse_velocity':
      return (
        <div className="space-y-4">
          <div className="h-48">
            <TrendArea points={data.pulse.velocityTrend} />
          </div>
          <p className="text-sm text-app-muted">
            Tasks completed per day (rolling window). Active projects: {data.pulse.activeProjects}. Velocity index:{' '}
            {data.pulse.avgSprintVelocity.toFixed(0)}%.
          </p>
          <FooterLink href={ROUTES.PROJECTS} label="Open Projects" />
        </div>
      );
    case 'pulse_blockers':
      return (
        <div className="space-y-2">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-app-muted border-b border-white/10">
                <th className="py-2 pr-2">Task</th>
                <th className="py-2">Project</th>
              </tr>
            </thead>
            <tbody>
              {data.pulse.blockers.map((b) => (
                <tr key={b.id} className="border-b border-white/[0.06]">
                  <td className="py-2 pr-2 text-app-text">{b.title}</td>
                  <td className="py-2 text-app-muted">{b.projectName ?? '—'}</td>
                </tr>
              ))}
              {data.pulse.blockers.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-4 text-app-muted text-center">
                    No blocked tasks right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <FooterLink href={ROUTES.PROJECTS} label="Open board" />
        </div>
      );
    case 'brain_knowledge':
      return (
        <div className="space-y-3">
          <p className="text-sm text-app-muted">{data.brain.publishedDocCount} published documents.</p>
          <ul className="space-y-2">
            {data.brain.knowledgeRecent.map((d) => (
              <li key={d.id}>
                <Link to={`${ROUTES.KNOWLEDGE_HUB}/${d.slug}`} className="text-sm text-primary-400 hover:underline">
                  {d.title}
                </Link>
                <p className="text-[10px] text-app-muted">{d.updatedAt}</p>
              </li>
            ))}
          </ul>
          <FooterLink href={ROUTES.KNOWLEDGE_HUB} label="Knowledge Hub home" />
        </div>
      );
    case 'growth_leaderboard':
      return (
        <div className="space-y-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-app-muted border-b border-white/10">
                <th className="py-2 text-left">#</th>
                <th className="py-2 text-left">Name</th>
                <th className="py-2 text-right">XP</th>
              </tr>
            </thead>
            <tbody>
              {data.growth.leaderboard.map((r) => (
                <tr key={r.userId} className="border-b border-white/[0.06]">
                  <td className="py-2 text-app-muted">{r.rank}</td>
                  <td className="py-2 text-app-text">{r.name}</td>
                  <td className="py-2 text-right tabular-nums">{r.xp}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <FooterLink href={ROUTES.ACHIEVEMENTS} label="Achievements" />
        </div>
      );
    case 'growth_radar':
      return (
        <div className="space-y-4">
          <div className="h-64">
            <TeamRadarChart data={data.growth.xpRadar} />
          </div>
          <p className="text-sm text-app-muted">
            Normalized XP share across top collaborators. Vibe index:{' '}
            {data.growth.vibeScore != null ? data.growth.vibeScore.toFixed(1) : 'n/a'} ({data.growth.engagementTrend}).
          </p>
        </div>
      );
    case 'future_okrs':
      return (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Overall" value={`${data.future.okrs.overallProgress.toFixed(0)}%`} />
            <Stat label="On track" value={String(data.future.okrs.onTrack)} />
            <Stat label="At risk" value={String(data.future.okrs.atRisk)} />
            <Stat label="Behind" value={String(data.future.okrs.behind)} />
          </div>
          <FooterLink href={ROUTES.OKR} label="Open OKRs" />
        </div>
      );
    case 'future_milestones':
      return (
        <ul className="space-y-2 text-sm">
          {data.future.milestones.map((m, i) => (
            <li key={`${m.title}-${i}`} className="flex justify-between border-b border-white/[0.06] pb-2">
              <span className="text-app-text">{m.title}</span>
              <span className="text-app-muted shrink-0">{m.dueDate ?? '—'}</span>
            </li>
          ))}
          {data.future.milestones.length === 0 && <li className="text-app-muted">No milestones in range.</li>}
          <FooterLink href={ROUTES.OKR} label="OKR periods" />
        </ul>
      );
    default:
      return <p className="text-app-muted text-sm">Unknown panel.</p>;
  }
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[10px] uppercase text-app-muted">{label}</p>
      <p className="text-lg font-semibold text-app-text">{value}</p>
    </div>
  );
}

function FooterLink({ href, label }: { href: string; label: string }): JSX.Element {
  return (
    <Link to={href} className="inline-block text-sm font-medium text-primary-400 hover:text-primary-300 pt-2">
      {label} →
    </Link>
  );
}

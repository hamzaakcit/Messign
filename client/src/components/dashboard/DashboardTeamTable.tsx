import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type ColumnDef,
} from '@tanstack/react-table';
import { Avatar } from '@/components/ui';
import { Eye, Pencil, MoreHorizontal } from 'lucide-react';
import { useDashboardStore } from '@/stores/dashboardStore';
import { cn } from '@/lib/utils';
import type { TeamMemberEnterprise, TeamMemberWholesale } from '@/types/performance';

type TeamMember = TeamMemberEnterprise | TeamMemberWholesale;

const statusColors: Record<string, string> = {
  exceeding: 'bg-green-500/20 text-green-400 border-green-500/30',
  on_target: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  needs_attention: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  below_target: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function targetColor(pct: number): string {
  if (pct >= 100) return 'text-green-500';
  if (pct >= 90) return 'text-yellow-500';
  return 'text-red-500';
}

function rateBadge(rate: number): string {
  if (rate >= 98) return 'bg-green-500/20 text-green-400';
  if (rate >= 95) return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-red-500/20 text-red-400';
}


export type DashboardTeamView = 'enterprise' | 'wholesale';

interface DashboardTeamTableProps {
  view: DashboardTeamView;
  members: TeamMember[];
  loading?: boolean;
  error?: string | null;
  onAction?: (memberId: string, action: 'view' | 'edit' | 'more') => void;
}

export function DashboardTeamTable({
  view,
  members,
  loading,
  error,
  onAction,
}: DashboardTeamTableProps) {
  const { activeEntity, setActiveEntity } = useDashboardStore();
  const columnHelper = createColumnHelper<TeamMember>();

  const enterpriseColumns = useMemo(
    () => [
      columnHelper.accessor('rank', {
        header: 'Rank',
        cell: ({ getValue }) => {
          const rank = getValue();
          return rank <= 3 ? (
            <span className="text-lg">{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</span>
          ) : (
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/5 text-app-text text-sm font-medium">
              {rank}
            </span>
          );
        },
        size: 50,
      }),
      columnHelper.accessor((r) => ({ name: r.name, avatar: r.avatar, role: r.role }), {
        id: 'member',
        header: 'Member',
        cell: ({ getValue }) => {
          const { name, avatar, role } = getValue();
          return (
            <div className="flex items-center gap-2">
              <Avatar src={avatar} name={name} size="sm" showStatus={false} className="shrink-0" />
              <div>
                <p className="font-medium text-sm text-app-text">{name}</p>
                <p className="text-xs text-app-muted">{role}</p>
              </div>
            </div>
          );
        },
        size: 200,
      }),
      columnHelper.accessor((r) => (r as TeamMemberEnterprise).metrics.revenue, {
        id: 'revenue',
        header: 'Revenue',
        cell: ({ getValue }) => {
          const m = getValue();
          return (
            <div>
              <p className="font-medium text-sm text-app-text">{m.formatted}</p>
              <p className={cn('text-xs', targetColor(m.targetPercent))}>{m.targetPercent}% vs target</p>
            </div>
          );
        },
        size: 120,
      }),
      columnHelper.accessor((r) => (r as TeamMemberEnterprise).metrics.smsAttempts, {
        id: 'sms',
        header: 'SMS',
        cell: ({ getValue }) => {
          const m = getValue();
          return (
            <div>
              <p className="text-sm text-app-text">{m.formatted}</p>
              <span className={cn('inline-block mt-0.5 px-2 py-0.5 rounded text-xs', rateBadge(m.deliveryRate))}>
                {m.deliveryRate}%
              </span>
            </div>
          );
        },
        size: 120,
      }),
      columnHelper.accessor((r) => (r as TeamMemberEnterprise).metrics.mailAttempts, {
        id: 'mail',
        header: 'Mail',
        cell: ({ getValue }) => {
          const m = getValue();
          return (
            <div>
              <p className="text-sm text-app-text">{m.formatted}</p>
              <span className={cn('inline-block mt-0.5 px-2 py-0.5 rounded text-xs', rateBadge(m.deliveryRate))}>
                {m.deliveryRate}%
              </span>
            </div>
          );
        },
        size: 120,
      }),
      columnHelper.accessor((r) => (r as TeamMemberEnterprise).metrics.conversionRate, {
        id: 'conv',
        header: 'Conv.',
        cell: ({ getValue }) => {
          const rate = getValue();
          return (
            <div>
              <p className="text-sm text-app-text font-medium">{rate}%</p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-white/10 overflow-hidden max-w-[60px]">
                <div
                  className="h-full rounded-full bg-primary-500"
                  style={{ width: `${Math.min(100, rate * 8)}%` }}
                />
              </div>
            </div>
          );
        },
        size: 90,
      }),
      columnHelper.accessor('statusLabel', {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status;
          return (
            <span
              className={cn(
                'inline-flex px-2 py-0.5 rounded text-xs font-medium border',
                statusColors[status] ?? 'bg-white/5 text-app-muted'
              )}
            >
              {row.original.statusLabel}
            </span>
          );
        },
        size: 100,
      }),
      columnHelper.accessor((r) => (r as TeamMemberEnterprise).metrics.revenue.trend, {
        id: 'trend',
        header: 'Trend',
        cell: ({ getValue }) => {
          const t = getValue();
          return (
            <span className={cn('text-xs', t.direction === 'up' ? 'text-green-500' : 'text-red-500')}>
              {t.direction === 'up' ? '↑' : '↓'} {Math.abs(t.percent)}%
            </span>
          );
        },
        size: 70,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onAction?.(row.original.id, 'view')}
              className="p-1.5 rounded text-app-muted hover:text-app-text hover:bg-white/10"
              aria-label="View"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onAction?.(row.original.id, 'edit')}
              className="p-1.5 rounded text-app-muted hover:text-app-text hover:bg-white/10"
              aria-label="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onAction?.(row.original.id, 'more')}
              className="p-1.5 rounded text-app-muted hover:text-app-text hover:bg-white/10"
              aria-label="More"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        ),
        size: 80,
      }),
    ],
    [columnHelper, onAction]
  ) as ColumnDef<TeamMember, unknown>[];

  const wholesaleColumns = useMemo(
    () => [
      columnHelper.accessor('rank', {
        header: 'Rank',
        cell: ({ getValue }) => {
          const rank = getValue();
          return rank <= 3 ? (
            <span className="text-lg">{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</span>
          ) : (
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/5 text-app-text text-sm font-medium">
              {rank}
            </span>
          );
        },
        size: 50,
      }),
      columnHelper.accessor((r) => ({ name: r.name, avatar: r.avatar, role: r.role }), {
        id: 'member',
        header: 'Member',
        cell: ({ getValue }) => {
          const { name, avatar, role } = getValue();
          return (
            <div className="flex items-center gap-2">
              <Avatar src={avatar} name={name} size="sm" showStatus={false} className="shrink-0" />
              <div>
                <p className="font-medium text-sm text-app-text">{name}</p>
                <p className="text-xs text-app-muted">{role}</p>
              </div>
            </div>
          );
        },
        size: 200,
      }),
      columnHelper.accessor((r) => (r as TeamMemberWholesale).metrics.revenue, {
        id: 'revenue',
        header: 'Revenue',
        cell: ({ getValue }) => {
          const m = getValue();
          return (
            <div>
              <p className="font-medium text-sm text-app-text">{m.formatted}</p>
              <p className={cn('text-xs', targetColor(m.targetPercent))}>{m.targetPercent}% vs target</p>
            </div>
          );
        },
        size: 120,
      }),
      columnHelper.accessor((r) => (r as TeamMemberWholesale).metrics.smsVolume.formatted, {
        id: 'sms',
        header: 'SMS',
        cell: ({ getValue }) => <span className="text-sm text-app-text">{getValue()}</span>,
        size: 100,
      }),
      columnHelper.accessor((r) => (r as TeamMemberWholesale).metrics.smsVolume.deliveryRate, {
        id: 'del',
        header: 'Del.',
        cell: ({ getValue }) => (
          <span className={cn('inline-block px-2 py-0.5 rounded text-xs', rateBadge(getValue()))}>
            {getValue()}%
          </span>
        ),
        size: 80,
      }),
      columnHelper.accessor((r) => (r as TeamMemberWholesale).metrics.smsVolume.responseRate, {
        id: 'resp',
        header: 'Resp.',
        cell: ({ getValue }) => <span className="text-sm text-app-text">{getValue()}%</span>,
        size: 80,
      }),
      columnHelper.accessor((r) => (r as TeamMemberWholesale).metrics.smsVolume.costPerSMS, {
        id: 'cost',
        header: 'Cost',
        cell: ({ getValue }) => (
          <span className="text-sm text-app-text font-mono text-xs">${getValue().toFixed(4)}</span>
        ),
        size: 80,
      }),
      columnHelper.accessor('statusLabel', {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span
            className={cn(
              'inline-flex px-2 py-0.5 rounded text-xs font-medium border',
              statusColors[row.original.status] ?? 'bg-white/5 text-app-muted'
            )}
          >
            {row.original.statusLabel}
          </span>
        ),
        size: 100,
      }),
      columnHelper.accessor((r) => (r as TeamMemberWholesale).metrics.revenue.trend, {
        id: 'trend',
        header: 'Trend',
        cell: ({ getValue }) => {
          const t = getValue();
          return (
            <span className={cn('text-xs', t.direction === 'up' ? 'text-green-500' : 'text-red-500')}>
              {t.direction === 'up' ? '↑' : '↓'} {Math.abs(t.percent)}%
            </span>
          );
        },
        size: 70,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => onAction?.(row.original.id, 'view')}
              className="p-1.5 rounded text-app-muted hover:text-app-text hover:bg-white/10"
              aria-label="View"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onAction?.(row.original.id, 'edit')}
              className="p-1.5 rounded text-app-muted hover:text-app-text hover:bg-white/10"
              aria-label="Edit"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onAction?.(row.original.id, 'more')}
              className="p-1.5 rounded text-app-muted hover:text-app-text hover:bg-white/10"
              aria-label="More"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        ),
        size: 80,
      }),
    ],
    [columnHelper, onAction]
  ) as ColumnDef<TeamMember, unknown>[];

  const columns = view === 'enterprise' ? enterpriseColumns : wholesaleColumns;

  const table = useReactTable({
    data: members,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  if (loading && members.length === 0) {
    return (
      <div className="flex items-center justify-center h-full py-12">
        <p className="text-sm text-app-muted">Loading team data...</p>
      </div>
    );
  }

  if (error && members.length === 0) {
    return (
      <div className="flex items-center justify-center h-full py-12">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
      <table className="w-full min-w-[900px] border-collapse" role="table">
        <thead className="sticky top-0 z-10 bg-[#252536] border-b border-gray-800 shadow-[0_1px_0_0_rgba(0,0,0,0.1)]">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-wider text-app-muted"
                  style={{ width: header.getSize() }}
                >
                  {header.column.id ? flexRender(header.column.columnDef.header, header.getContext()) : null}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const isActive = activeEntity === row.original.id;
            return (
            <tr
              key={row.id}
              role="button"
              tabIndex={0}
              onClick={() => setActiveEntity(row.original.id, row.original.name)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveEntity(row.original.id, row.original.name);
                }
              }}
              className={cn(
                'border-b border-gray-800/50 hover:bg-white/5 transition-colors cursor-pointer',
                isActive && 'ring-1 ring-[#2dd4bf] bg-white/5'
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="py-2 px-3"
                  style={{ width: cell.column.getSize() }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          );
          })}
        </tbody>
      </table>
    </div>
  );
}

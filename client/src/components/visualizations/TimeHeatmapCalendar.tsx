import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

export interface TimeHeatmapDay {
  date: string;
  hours: number;
  billable: number;
}

interface TimeHeatmapCalendarProps {
  data: TimeHeatmapDay[];
  weeks?: number;
  onDayClick?: (date: string) => void;
}

const HOUR_COLORS = ['#161B22', '#0E4429', '#006D32', '#26A641', '#39D353'];
const BILLABLE_COLORS = ['#0E2F44', '#0D4A6B', '#1B6FA0', '#3B9DD1', '#60B4E8'];

function getColor(hours: number, billableMode: boolean): string {
  const scale = billableMode ? BILLABLE_COLORS : HOUR_COLORS;
  if (hours <= 0) return scale[0];
  if (hours < 3) return scale[1];
  if (hours < 5) return scale[2];
  if (hours < 7) return scale[3];
  return scale[4];
}

function getDayOfWeek(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1;
}

export function TimeHeatmapCalendar({ data, weeks = 26, onDayClick }: TimeHeatmapCalendarProps) {
  const [billableMode, setBillableMode] = useState(false);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; day: TimeHeatmapDay } | null>(null);

  const dataByDate = useMemo(() => {
    const map = new Map<string, TimeHeatmapDay>();
    for (const d of data) {
      const key = d.date.slice(0, 10);
      const existing = map.get(key);
      if (existing) {
        existing.hours += d.hours;
        existing.billable += d.billable;
      } else {
        map.set(key, { ...d, hours: d.hours, billable: d.billable });
      }
    }
    return map;
  }, [data]);

  const { grid, monthLabels, weekLabels } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dof = today.getDay();
    const mondayOffset = dof === 0 ? 6 : dof - 1;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - mondayOffset);

    const days: { date: Date; col: number; row: number }[] = [];
    const seenMonths = new Set<string>();
    const monthLabels: { col: number; label: string }[] = [];
    const weekLabels = ['Mon', '', 'Wed', '', 'Fri', '', ''];

    for (let w = 0; w < weeks; w++) {
      const weekMonday = new Date(thisMonday);
      weekMonday.setDate(thisMonday.getDate() - (weeks - 1 - w) * 7);
      for (let d = 0; d < 7; d++) {
        const date = new Date(weekMonday);
        date.setDate(weekMonday.getDate() + d);
        if (date > today) continue;

        const row = getDayOfWeek(date);
        if (d === 0) {
          const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
          if (!seenMonths.has(monthKey)) {
            seenMonths.add(monthKey);
            monthLabels.push({ col: w, label: date.toLocaleDateString('en-US', { month: 'short' }) });
          }
        }
        days.push({ date, col: w, row });
      }
    }

    return {
      grid: days,
      monthLabels,
      weekLabels,
    };
  }, [weeks]);

  const cellSize = 12;
  const gap = 2;
  const width = grid.length > 0 ? (Math.max(...grid.map((g) => g.col)) + 1) * (cellSize + gap) : 0;
  const height = 7 * (cellSize + gap);

  return (
    <div className="rounded-lg border border-[var(--app-border)] p-4 bg-[var(--app-bg)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-app-text">Hours Logged</h3>
        <div className="flex rounded-lg border border-[var(--app-border)] overflow-hidden">
          <button
            onClick={() => setBillableMode(false)}
            className={`px-2.5 py-1 text-xs transition ${billableMode ? 'bg-app-surface-tertiary text-app-muted' : 'bg-primary-600 text-app-text'}`}
          >
            Total Hours
          </button>
          <button
            onClick={() => setBillableMode(true)}
            className={`px-2.5 py-1 text-xs transition ${billableMode ? 'bg-primary-600 text-app-text' : 'bg-app-surface-tertiary text-app-muted'}`}
          >
            Billable Only
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex flex-col justify-between text-[10px] text-app-muted py-1.5">
          {weekLabels.map((l, i) => (
            <span key={i} className="h-3 flex items-center">
              {l}
            </span>
          ))}
        </div>
        <div className="flex-1">
          <div className="flex gap-0.5 mb-2 text-[10px] text-app-muted">
            {monthLabels.map((m, i) => (
              <span key={i} style={{ width: (cellSize + gap) * 4.33, marginLeft: i === 0 ? 0 : -((cellSize + gap) * 2) }}>
                {m.label}
              </span>
            ))}
          </div>
          <svg width={width} height={height} className="overflow-visible">
            {grid.map((g, i) => {
              const key = g.date.toISOString().slice(0, 10);
              const dayData = dataByDate.get(key);
              const value = billableMode ? (dayData?.billable ?? 0) : (dayData?.hours ?? 0);
              const color = getColor(value, billableMode);
              const x = g.col * (cellSize + gap);
              const y = g.row * (cellSize + gap);

              return (
                <motion.rect
                  key={key}
                  x={x}
                  y={y}
                  width={cellSize}
                  height={cellSize}
                  rx={2}
                  fill={color}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: i * 0.002 }}
                  className="cursor-pointer hover:outline hover:outline-2 hover:outline-white/50"
                  onClick={() => onDayClick?.(key)}
                  onMouseEnter={(e) => {
                    setTooltip({
                      x: e.clientX,
                      y: e.clientY,
                      day: dayData ?? { date: key, hours: 0, billable: 0 },
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
          </svg>
        </div>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1.5 rounded bg-[var(--app-card)] border border-[var(--app-border)] text-xs shadow-lg pointer-events-none"
          style={{ left: tooltip.x + 10, top: tooltip.y + 10 }}
        >
          {new Date(tooltip.day.date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
          : {tooltip.day.hours.toFixed(1)}h
          {tooltip.day.billable > 0 && ` (${tooltip.day.billable.toFixed(1)}h billable)`}
        </div>
      )}
    </div>
  );
}

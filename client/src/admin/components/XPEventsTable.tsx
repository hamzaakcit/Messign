import { Target } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { XP_REWARDS } from '@/types';

const EVENT_LABELS: Record<string, string> = {
  message_sent: 'Message sent',
  task_completed: 'Task completion',
  project_completed: 'Project completed',
  document_created: 'Document created',
  badge_earned: 'Badge earned',
  daily_login: 'Daily login',
  help_colleague: 'Help colleague',
  code_review: 'Code review',
  bug_fixed: 'Bug fixed',
};

const events = Object.entries(XP_REWARDS).map(([type, baseXp]) => ({
  type,
  label: EVENT_LABELS[type] ?? type.replace(/_/g, ' '),
  baseXp,
  multiplier: 1,
}));

export function XPEventsTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary-400" />
          MP events configuration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-gray-400">
                <th className="py-2 px-3">Event type</th>
                <th className="py-2 px-3">Base MP</th>
                <th className="py-2 px-3">Multiplier</th>
                <th className="py-2 px-3 w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.type} className="border-b border-white/5">
                  <td className="py-2 px-3 text-white">{ev.label}</td>
                  <td className="py-2 px-3 text-gray-400">{ev.baseXp}</td>
                  <td className="py-2 px-3 text-gray-400">{ev.multiplier}x</td>
                  <td className="py-2 px-3 text-gray-500 text-xs">Edit (read-only)</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-3">Read-only. Edit and save when backend xp-config API is available.</p>
      </CardContent>
    </Card>
  );
}

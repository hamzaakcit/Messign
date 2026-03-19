import type { AIMessage } from '@/types/knowledge-hub/ai';

function buildSuggestions(message: AIMessage): string[] {
  const tools = message.metadata?.toolsUsed ?? [];
  const mod = message.specialist?.module ?? '';
  const out: string[] = [];

  const has = (s: string) => tools.some((t) => t.includes(s));

  if (has('get_tasks_by_user') || has('projects:')) {
    out.push('Show my overdue tasks');
    out.push('Give me an overview of all active projects');
  }
  if (has('get_financial_summary') || has('finance:')) {
    out.push("What's our revenue this quarter?");
    out.push('Show pending invoices');
  }
  if (has('get_employee_performance') || has('people:') || mod === 'hr') {
    out.push('How is my team doing this month?');
    out.push('Show all teams performance comparison');
  }
  if (has('get_team_overview')) {
    out.push('Show my performance this month');
  }
  if (has('get_time_summary') || has('time:')) {
    out.push('Show my utilization report');
  }

  if (out.length === 0) {
    if (mod === 'time') {
      out.push('What are my open tasks?', 'Give me an overview of all active projects');
    }
    if (mod === 'finance') {
      out.push('What is the company-wide financial summary this month?');
    }
    if (mod === 'hr') {
      out.push('Show my performance this month', 'How is my team doing this month?');
    }
  }

  return [...new Set(out)].slice(0, 4);
}

export function DoraFollowUpChips({
  message,
  onSendMessage,
}: {
  message: AIMessage;
  onSendMessage?: (text: string) => void;
}) {
  if (message.role !== 'assistant' || message.isStreaming || !onSendMessage) return null;
  const suggestions = buildSuggestions(message);
  if (suggestions.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span className="text-[10px] text-white/35 w-full uppercase tracking-wide">Try next</span>
      {suggestions.map((text) => (
        <button
          key={text}
          type="button"
          onClick={() => onSendMessage(text)}
          className="text-[11px] px-2.5 py-1 rounded-full bg-white/5 text-sky-300/90 border border-white/10 hover:bg-sky-500/10 hover:border-sky-500/30 transition-colors"
        >
          {text}
        </button>
      ))}
    </div>
  );
}

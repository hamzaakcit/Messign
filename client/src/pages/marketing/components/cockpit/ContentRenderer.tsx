import { useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

function splitWithHighlights(text: string): ReactNode[] {
  if (!text) return [];
  const re = /(#[\w\u00c0-\u024f]+)|(https?:\/\/[^\s<]+[^\s<.,;:!?)])/gi;
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={`t-${k++}`}>{text.slice(last, m.index)}</span>);
    }
    const chunk = m[0];
    if (chunk.startsWith('#')) {
      parts.push(
        <span key={`h-${k++}`} className="font-medium text-cyan-400/90">
          {chunk}
        </span>,
      );
    } else {
      parts.push(
        <a
          key={`a-${k++}`}
          href={chunk}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan-400/80 underline decoration-cyan-500/30 underline-offset-2 hover:text-cyan-300"
        >
          {chunk}
        </a>,
      );
    }
    last = m.index + chunk.length;
  }
  if (last < text.length) {
    parts.push(<span key={`t-${k++}`}>{text.slice(last)}</span>);
  }
  return parts;
}

export function ContentRenderer({
  body,
  className,
}: {
  body: string | null | undefined;
  className?: string;
}) {
  const text = body ?? '';
  const nodes = useMemo(() => splitWithHighlights(text), [text]);
  return (
    <div className={cn('whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-200', className)}>
      {nodes.length > 0 ? nodes : <span className="text-slate-500">No body text.</span>}
    </div>
  );
}

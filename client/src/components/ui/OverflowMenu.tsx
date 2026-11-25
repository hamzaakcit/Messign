import { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OverflowMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * The `⋯` button for a screen's secondary actions (ADR-026). Closes on choice, outside click and Escape;
 * arrow keys move between items.
 */
export function OverflowMenu({
  items,
  label = 'More actions',
  className,
}: {
  items: OverflowMenuItem[];
  label?: string;
  className?: string;
}): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    wrapRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  const moveFocus = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const entries = Array.from(wrapRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []);
    const at = entries.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (at + 1) % entries.length : (at - 1 + entries.length) % entries.length;
    entries[next]?.focus();
  };

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e7e0d6] bg-white text-[#1c1917] hover:bg-[#f4efe8] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          data-escape-layer=""
          aria-label={label}
          onKeyDown={moveFocus}
          className="absolute right-0 top-full z-50 mt-1 min-w-48 rounded-xl border border-[#e7e0d6] bg-white py-1 text-sm text-[#1c1917] shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="block w-full px-3 py-2 text-left hover:bg-[#f4efe8] focus:bg-[#f4efe8] focus:outline-none disabled:opacity-40"
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

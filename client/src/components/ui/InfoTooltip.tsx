import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { helpEntry, type HelpId } from '@/lib/helpContent';
import { useHelpDrawer } from '@/stores/helpDrawerStore';

export interface InfoTooltipProps {
  /** Tooltip content. Prefer `helpId` on marketing and engage screens (ADR-026). */
  content?: React.ReactNode;
  /** Registry entry: its `tip` is shown, and a `body` adds "Learn more" that opens the HelpDrawer. */
  helpId?: HelpId;
  /** Optional class for the icon wrapper. */
  className?: string;
  /** Optional aria-label for the icon. */
  'aria-label'?: string;
}

/**
 * An (i) button that shows a short explanation on hover, keyboard focus, or click/tap, and hides on Escape.
 * The popover is portalled so it is not clipped by overflow:hidden parents.
 */
export function InfoTooltip({ content, helpId, className, 'aria-label': ariaLabel }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** A click or tap focuses the button before its click event; only keyboard focus should open on focus. */
  const pointerRef = useRef<string | null>(null);
  /** Escape returns focus to the button; that focus must not reopen the popover. */
  const refocusRef = useRef(false);
  const tooltipId = useId();
  const openHelp = useHelpDrawer((s) => s.open);

  const entry = helpId ? helpEntry(helpId) : null;
  const body = entry?.body;
  const text = entry ? entry.tip : content;
  const label = ariaLabel ?? (entry ? `About ${entry.title}` : 'More information');

  const updatePosition = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({ top: rect.bottom + 6, left: rect.left });
  }, []);

  const clearLeave = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  };

  const show = useCallback(() => {
    clearLeave();
    updatePosition();
    setVisible(true);
  }, [updatePosition]);

  const hide = useCallback((delay = 0) => {
    clearLeave();
    if (delay <= 0) {
      setVisible(false);
      return;
    }
    leaveTimeoutRef.current = setTimeout(() => {
      leaveTimeoutRef.current = null;
      setVisible(false);
    }, delay);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setVisible(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setVisible(false);
        refocusRef.current = true;
        buttonRef.current?.focus();
        refocusRef.current = false;
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !wrapperRef.current) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [visible, updatePosition]);

  useEffect(() => clearLeave, []);

  const popover = visible && (
    <div
      ref={popoverRef}
      id={tooltipId}
      role="tooltip"
      data-escape-layer=""
      className="fixed z-[9999] w-72 rounded-xl border border-slate-600 bg-slate-800 p-3.5 text-[13px] leading-relaxed text-slate-100 shadow-xl ring-1 ring-black/20"
      style={{ top: position.top, left: position.left }}
      onMouseEnter={show}
      onMouseLeave={() => hide(0)}
    >
      {text}
      {helpId && body ? (
        <button
          type="button"
          className="mt-2 block text-[12px] font-medium text-sky-300 underline underline-offset-2 hover:text-sky-200"
          onClick={() => {
            setVisible(false);
            openHelp(helpId);
          }}
        >
          Learn more
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      <span
        ref={wrapperRef}
        className={cn('relative inline-flex items-center', className)}
        onMouseEnter={show}
        onMouseLeave={() => hide(150)}
      >
        <button
          ref={buttonRef}
          type="button"
          aria-label={label}
          aria-expanded={visible}
          aria-describedby={visible ? tooltipId : undefined}
          onPointerDown={(e) => {
            pointerRef.current = e.pointerType;
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const pointer = pointerRef.current;
            pointerRef.current = null;
            // A mouse already opened it on hover, so a click keeps it open; a tap (or Enter) toggles.
            if (pointer === 'mouse') show();
            else if (visible) hide(0);
            else show();
          }}
          onFocus={() => {
            if (!pointerRef.current && !refocusRef.current) show();
          }}
          onBlur={(e) => {
            if (popoverRef.current?.contains(e.relatedTarget as Node)) return;
            hide(150);
          }}
          className="inline-flex rounded-full text-app-muted hover:text-app-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60"
        >
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </button>
      </span>
      {typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}
    </>
  );
}

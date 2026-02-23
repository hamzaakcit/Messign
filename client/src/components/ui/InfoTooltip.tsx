import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface InfoTooltipProps {
  /** Tooltip content (plain text or JSX). */
  content: React.ReactNode;
  /** Optional class for the icon wrapper. */
  className?: string;
  /** Optional aria-label for the icon. */
  'aria-label'?: string;
}

/**
 * Small Info icon that shows a popover with the given content on hover (or focus).
 * Renders the popover in a portal so it is not clipped by overflow:hidden parents.
 */
export function InfoTooltip({ content, className, 'aria-label': ariaLabel }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 6,
      left: rect.left,
    });
  }, []);

  const show = useCallback(() => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
    updatePosition();
    setVisible(true);
  }, [updatePosition]);

  const hide = useCallback((delay = 0) => {
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
      if (
        wrapperRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) return;
      setVisible(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
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

  useEffect(() => {
    return () => {
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    };
  }, []);

  const popover = visible && (
    <div
      ref={popoverRef}
      className="fixed z-[9999] w-72 rounded-xl border border-slate-600 bg-slate-800 p-3.5 text-[13px] leading-relaxed text-slate-100 shadow-xl ring-1 ring-black/20"
      style={{
        top: position.top,
        left: position.left,
      }}
      role="tooltip"
      onMouseEnter={show}
      onMouseLeave={() => hide(0)}
    >
      {content}
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
        <Info
          className="w-3.5 h-3.5 text-app-muted hover:text-app cursor-help shrink-0"
          aria-label={ariaLabel ?? 'More information'}
        />
      </span>
      {typeof document !== 'undefined' && popover
        ? createPortal(popover, document.body)
        : null}
    </>
  );
}

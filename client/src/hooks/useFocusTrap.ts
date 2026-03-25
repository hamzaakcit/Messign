import { useEffect, type RefObject } from 'react';

/**
 * Trap Tab focus within `rootRef` while `active` is true (e.g. mobile modal sheets).
 */
export function useFocusTrap(active: boolean, rootRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!active || !rootRef.current) return;
    const root = rootRef.current;
    const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
      (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
    );
    const list = focusables();
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    first.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || list.length === 0) return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, [active, rootRef]);
}

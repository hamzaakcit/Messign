import { useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

let openGlassCount = 0;

interface GlassSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: React.ReactNode;
}

/**
 * Slide-over with blurred backdrop and glass-morphism panel (Command Center deep dives).
 */
export function GlassSlideOver({
  isOpen,
  onClose,
  title,
  width = 560,
  children,
}: GlassSlideOverProps): JSX.Element {
  const layerRef = useRef(0);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && layerRef.current === openGlassCount) {
        e.stopImmediatePropagation();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    openGlassCount += 1;
    layerRef.current = openGlassCount;
    window.addEventListener('keydown', handleEscape, true);
    document.body.style.overflow = 'hidden';
    const focusId = requestAnimationFrame(() => {
      closeBtnRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(focusId);
      window.removeEventListener('keydown', handleEscape, true);
      openGlassCount -= 1;
      if (openGlassCount === 0) {
        document.body.style.overflow = '';
      }
    };
  }, [isOpen, handleEscape]);

  const zBackdrop = 59 + (layerRef.current > 1 ? layerRef.current * 2 : 0);
  const zPanel = zBackdrop + 1;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            style={{ zIndex: zBackdrop }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            className="fixed right-0 top-0 bottom-0 flex flex-col border-l border-white/10 shadow-2xl backdrop-blur-xl bg-[#0c0e14]/85"
            style={{
              zIndex: zPanel,
              width: `min(${width}px, 100vw)`,
            }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            role="dialog"
            aria-modal
            aria-labelledby="glass-slide-title"
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08] shrink-0">
              <h2 id="glass-slide-title" className="text-base font-semibold text-app-text truncate pr-2">
                {title}
              </h2>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-app-muted hover:text-app-text hover:bg-white/5"
                title="Close"
                aria-label="Close panel"
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

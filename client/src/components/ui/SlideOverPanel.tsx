import { useEffect, useCallback, useRef, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

let openPanelCount = 0;

interface SlideOverPanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  width?: number;
  children: React.ReactNode;
}

export function SlideOverPanel({
  isOpen,
  onClose,
  title,
  width = 640,
  children,
}: SlideOverPanelProps) {
  const titleId = useId();
  const layerRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isOpen, panelRef);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && layerRef.current === openPanelCount) {
        e.stopImmediatePropagation();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    openPanelCount += 1;
    layerRef.current = openPanelCount;
    window.addEventListener('keydown', handleEscape, true);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleEscape, true);
      openPanelCount -= 1;
      if (openPanelCount === 0) {
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
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/40"
            style={{ zIndex: zBackdrop }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            className="fixed right-0 top-0 bottom-0 flex flex-col border-l shadow-2xl outline-none"
            style={{
              zIndex: zPanel,
              width: `min(${width}px, 100vw)`,
              backgroundColor: 'var(--app-sidebar)',
              borderColor: 'var(--app-border)',
            }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            tabIndex={-1}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b shrink-0"
              style={{ borderColor: 'var(--app-border)' }}
            >
              <h2
                id={titleId}
                className="text-lg font-semibold truncate"
                style={{ color: 'var(--app-text)' }}
              >
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--app-text-muted)' }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    'var(--app-hover)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

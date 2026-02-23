import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Force dark theme inside the modal (e.g. when app is light) */
  forceDark?: boolean;
}

export function Modal({ isOpen, onClose, title, children, size = 'md', forceDark = false }: ModalProps) {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div
        className={cn(
          'relative w-full mx-4 bg-app-card border border-app-border rounded-2xl p-6 shadow-xl animate-fade-in',
          sizes[size]
        )}
        data-theme={forceDark ? 'dark' : undefined}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between mb-4 border-b border-app-border pb-4">
            <h2 className="text-xl font-semibold text-app">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-app-muted hover:text-app hover:bg-app-hover transition-colors focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-app"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        
        {/* Content */}
        {children}
      </div>
    </div>
  );
}

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface DropdownOption {
  value: string;
  label: string;
  color: string;
}

interface InlineDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  /** Render the trigger button — receives the currently selected option */
  children: (selected: DropdownOption | undefined, isOpen: boolean) => React.ReactNode;
}

export function InlineDropdown({ options, value, onChange, children }: InlineDropdownProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; direction: 'down' | 'up' }>({ top: 0, left: 0, direction: 'down' });
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const measure = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const direction = spaceBelow < 200 ? 'up' : 'down';
    setPos({
      top: direction === 'down' ? rect.bottom + 4 : rect.top - 4,
      left: rect.left,
      direction,
    });
  }, []);

  const toggle = useCallback(() => {
    if (!open) measure();
    setOpen((v) => !v);
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  return (
    <>
      <div ref={triggerRef} onClick={toggle} style={{ cursor: 'pointer', display: 'inline-flex' }}>
        {children(selected, open)}
      </div>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: pos.direction === 'down' ? pos.top : undefined,
              bottom: pos.direction === 'up' ? window.innerHeight - pos.top : undefined,
              left: pos.left,
              zIndex: 9999,
              minWidth: 140,
              padding: '4px 0',
              borderRadius: 10,
              background: 'rgba(15,23,42,0.95)',
              border: '1px solid rgba(56,189,248,0.15)',
              backdropFilter: 'blur(16px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(56,189,248,0.06)',
              animation: 'dora-dropdown-in 100ms ease-out forwards',
              transformOrigin: pos.direction === 'down' ? 'top left' : 'bottom left',
            }}
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '7px 12px',
                  border: 'none',
                  background: opt.value === value ? 'rgba(56,189,248,0.08)' : 'transparent',
                  color: '#e2e8f0',
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'background 150ms',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(56,189,248,0.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = opt.value === value ? 'rgba(56,189,248,0.08)' : 'transparent'; }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: opt.color,
                    flexShrink: 0,
                  }}
                />
                {opt.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

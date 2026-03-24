import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface XPGainNotificationProps {
  amount: number;
  show: boolean;
}

export function XPGainNotification({ amount, show }: XPGainNotificationProps) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (show && amount > 0) {
      setVisible(true);
      setAnimating(true);

      const timer = setTimeout(() => {
        setAnimating(false);
        setTimeout(() => setVisible(false), 300);
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [show, amount]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        'fixed top-20 right-8 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl',
        'transition-all duration-300 ease-out',
        animating
          ? 'opacity-100 scale-100 translate-y-0 animate-slide-in-down'
          : 'opacity-0 scale-95 translate-y-[-10px]'
      )}
      style={{
        background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.98), rgba(20, 20, 35, 0.98))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow:
          '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) inset',
      }}
    >
      <div
        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br from-yellow-500/15 to-yellow-600/10 border border-yellow-500/30 shadow-[0_0_20px_rgba(251,191,36,0.2)]"
        aria-hidden
      >
        <Zap className="w-5 h-5 text-yellow-400" strokeWidth={2.5} />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-semibold text-app-text">MP Awarded</span>
        <span className="text-xs font-medium text-app-text/70">+{amount} MP</span>
      </div>
    </div>
  );
}

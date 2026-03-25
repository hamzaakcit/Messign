import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { useGameStore } from '@/stores/gameStore';

export function XPChatToast() {
  const xpGainEvents = useGameStore((s) => s.xpGainEvents);
  const [visible, setVisible] = useState(false);
  const latestEvent = xpGainEvents[xpGainEvents.length - 1];

  useEffect(() => {
    if (latestEvent) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 1800);
      return () => clearTimeout(timer);
    }
  }, [latestEvent]);

  if (!visible || !latestEvent) return null;

  return (
    <div className="fixed bottom-24 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent-500/90 to-primary-500/90 text-white shadow-lg shadow-accent-500/30 backdrop-blur-sm">
        <Zap className="w-5 h-5 animate-bounce" />
        <div>
          <span className="text-lg font-bold">+{latestEvent.amount} XP</span>
          <span className="text-xs ml-2 opacity-80">{latestEvent.reason}</span>
        </div>
      </div>
    </div>
  );
}

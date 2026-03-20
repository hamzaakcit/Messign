import {
  MessageSquare,
  Mail,
  Phone,
  Video,
  Send,
  Bell,
  Zap,
  Link,
  BarChart3,
  Shield,
  Cloud,
  Smartphone,
  Radio,
  MessageCircle,
  Hash,
  AtSign,
  Wifi,
} from 'lucide-react';
import styles from './FloatingBadges.module.css';

interface Badge {
  label: string;
  icon: React.ReactNode;
  position: { top?: string; bottom?: string; left?: string; right?: string };
  delay: number;
  duration: number;
  size: 'sm' | 'md' | 'lg';
}

/** CSS `steps()` typewriter: 3–5s per full word, grid sizes column so width 0→100% matches text. */
function StepsTypewriter({ text, delaySec }: { text: string; delaySec: number }) {
  const n = Math.max(1, text.length);
  const dur = Math.min(5, Math.max(3, 2.4 + n * 0.22));
  return (
    <span className={styles.grid}>
      <span className={styles.measure} aria-hidden>
        {text}
      </span>
      <span
        className={`${styles.clip} text-green-400`}
        style={{
          animation: `loginPillTypewriter ${dur}s steps(${n}, end) infinite`,
          animationDelay: `${delaySec}s`,
        }}
      >
        {text}
      </span>
    </span>
  );
}

const badges: Badge[] = [
  {
    label: 'SMS',
    icon: <MessageSquare className="w-4 h-4 text-green-400" aria-hidden />,
    position: { top: '8%', left: '3%' },
    delay: 0,
    duration: 48,
    size: 'md',
  },
  {
    label: 'WhatsApp',
    icon: <MessageCircle className="w-4 h-4 text-green-400" aria-hidden />,
    position: { top: '18%', left: '8%' },
    delay: 0.5,
    duration: 56,
    size: 'lg',
  },
  {
    label: 'Viber',
    icon: <Phone className="w-4 h-4 text-green-400" aria-hidden />,
    position: { top: '30%', left: '2%' },
    delay: 1,
    duration: 50,
    size: 'md',
  },
  {
    label: 'Telegram',
    icon: <Send className="w-4 h-4 text-green-400" aria-hidden />,
    position: { top: '42%', left: '6%' },
    delay: 1.5,
    duration: 54,
    size: 'md',
  },
  {
    label: 'API',
    icon: <Zap className="w-3 h-3 text-green-400" aria-hidden />,
    position: { top: '55%', left: '3%' },
    delay: 2,
    duration: 52,
    size: 'sm',
  },
  {
    label: 'Analytics',
    icon: <BarChart3 className="w-4 h-4 text-green-400" aria-hidden />,
    position: { top: '68%', left: '7%' },
    delay: 2.5,
    duration: 58,
    size: 'md',
  },
  {
    label: 'Push',
    icon: <Bell className="w-3 h-3 text-green-400" aria-hidden />,
    position: { top: '78%', left: '2%' },
    delay: 3,
    duration: 49,
    size: 'sm',
  },
  {
    label: 'Webhook',
    icon: <Link className="w-4 h-4 text-green-400" aria-hidden />,
    position: { top: '88%', left: '8%' },
    delay: 3.5,
    duration: 55,
    size: 'md',
  },
  {
    label: 'Email',
    icon: <Mail className="w-4 h-4 text-green-400" aria-hidden />,
    position: { top: '6%', right: '4%' },
    delay: 0.3,
    duration: 51,
    size: 'md',
  },
  {
    label: 'RCS',
    icon: <Smartphone className="w-4 h-4 text-green-400" aria-hidden />,
    position: { top: '16%', right: '9%' },
    delay: 0.8,
    duration: 57,
    size: 'lg',
  },
  {
    label: 'Voice',
    icon: <Phone className="w-4 h-4 text-green-400" aria-hidden />,
    position: { top: '28%', right: '3%' },
    delay: 1.3,
    duration: 53,
    size: 'md',
  },
  {
    label: 'Video',
    icon: <Video className="w-4 h-4 text-green-400" aria-hidden />,
    position: { top: '40%', right: '7%' },
    delay: 1.8,
    duration: 48,
    size: 'md',
  },
  {
    label: 'OTP',
    icon: <Shield className="w-3 h-3 text-green-400" aria-hidden />,
    position: { top: '52%', right: '2%' },
    delay: 2.3,
    duration: 52,
    size: 'sm',
  },
  {
    label: 'Cloud',
    icon: <Cloud className="w-4 h-4 text-green-400" aria-hidden />,
    position: { top: '64%', right: '8%' },
    delay: 2.8,
    duration: 56,
    size: 'md',
  },
  {
    label: 'Broadcast',
    icon: <Radio className="w-4 h-4 text-green-400" aria-hidden />,
    position: { top: '75%', right: '3%' },
    delay: 3.3,
    duration: 54,
    size: 'md',
  },
  {
    label: 'Chat',
    icon: <MessageSquare className="w-3 h-3 text-green-400" aria-hidden />,
    position: { top: '85%', right: '6%' },
    delay: 3.8,
    duration: 50,
    size: 'sm',
  },
  {
    label: 'LINE',
    icon: <Hash className="w-3 h-3 text-green-400" aria-hidden />,
    position: { top: '12%', left: '18%' },
    delay: 4,
    duration: 58,
    size: 'sm',
  },
  {
    label: 'Messenger',
    icon: <MessageCircle className="w-3 h-3 text-green-400" aria-hidden />,
    position: { top: '22%', right: '18%' },
    delay: 4.5,
    duration: 55,
    size: 'sm',
  },
  {
    label: 'Instagram',
    icon: <AtSign className="w-3 h-3 text-green-400" aria-hidden />,
    position: { top: '60%', left: '15%' },
    delay: 5,
    duration: 51,
    size: 'sm',
  },
  {
    label: 'Signal',
    icon: <Wifi className="w-3 h-3 text-green-400" aria-hidden />,
    position: { top: '70%', right: '16%' },
    delay: 5.5,
    duration: 53,
    size: 'sm',
  },
];

export function FloatingBadges() {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-sm font-medium gap-2',
  };

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden hidden lg:block" style={{ zIndex: 2 }} aria-hidden>
      {badges.map((badge, index) => (
        <div
          key={`${badge.label}-${index}`}
          className={`
            absolute rounded-md
            bg-green-950/30
            border border-green-500/20
            text-green-400 font-mono
            ${sizeClasses[badge.size]}
            flex items-center opacity-80
            animate-login-float
          `}
          style={{
            ...badge.position,
            animationDelay: `${badge.delay}s`,
            animationDuration: `${badge.duration}s`,
          }}
        >
          {badge.icon}
          <StepsTypewriter text={badge.label} delaySec={badge.delay} />
        </div>
      ))}
    </div>
  );
}

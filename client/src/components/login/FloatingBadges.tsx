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

interface Badge {
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  position: { top?: string; bottom?: string; left?: string; right?: string };
  delay: number;
  duration: number;
  size: 'sm' | 'md' | 'lg';
}

const badges: Badge[] = [
  {
    label: 'SMS',
    icon: <MessageSquare className="w-4 h-4" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-blue-500 to-blue-600',
    position: { top: '8%', left: '3%' },
    delay: 0,
    duration: 6,
    size: 'md',
  },
  {
    label: 'WhatsApp',
    icon: <MessageCircle className="w-4 h-4" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-green-500 to-green-600',
    position: { top: '18%', left: '8%' },
    delay: 0.5,
    duration: 7,
    size: 'lg',
  },
  {
    label: 'Viber',
    icon: <Phone className="w-4 h-4" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-purple-500 to-purple-600',
    position: { top: '30%', left: '2%' },
    delay: 1,
    duration: 5.5,
    size: 'md',
  },
  {
    label: 'Telegram',
    icon: <Send className="w-4 h-4" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-sky-500 to-sky-600',
    position: { top: '42%', left: '6%' },
    delay: 1.5,
    duration: 6.5,
    size: 'md',
  },
  {
    label: 'API',
    icon: <Zap className="w-3 h-3" aria-hidden />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-orange-400 to-orange-500',
    position: { top: '55%', left: '3%' },
    delay: 2,
    duration: 7,
    size: 'sm',
  },
  {
    label: 'Analytics',
    icon: <BarChart3 className="w-4 h-4" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-emerald-500 to-emerald-600',
    position: { top: '68%', left: '7%' },
    delay: 2.5,
    duration: 5,
    size: 'md',
  },
  {
    label: 'Push',
    icon: <Bell className="w-3 h-3" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-red-400 to-red-500',
    position: { top: '78%', left: '2%' },
    delay: 3,
    duration: 6,
    size: 'sm',
  },
  {
    label: 'Webhook',
    icon: <Link className="w-4 h-4" aria-hidden />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-pink-500 to-pink-600',
    position: { top: '88%', left: '8%' },
    delay: 3.5,
    duration: 7.5,
    size: 'md',
  },
  {
    label: 'Email',
    icon: <Mail className="w-4 h-4" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-indigo-500 to-indigo-600',
    position: { top: '6%', right: '4%' },
    delay: 0.3,
    duration: 6.5,
    size: 'md',
  },
  {
    label: 'RCS',
    icon: <Smartphone className="w-4 h-4" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-cyan-500 to-cyan-600',
    position: { top: '16%', right: '9%' },
    delay: 0.8,
    duration: 5.5,
    size: 'lg',
  },
  {
    label: 'Voice',
    icon: <Phone className="w-4 h-4" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-teal-500 to-teal-600',
    position: { top: '28%', right: '3%' },
    delay: 1.3,
    duration: 7,
    size: 'md',
  },
  {
    label: 'Video',
    icon: <Video className="w-4 h-4" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-rose-500 to-rose-600',
    position: { top: '40%', right: '7%' },
    delay: 1.8,
    duration: 6,
    size: 'md',
  },
  {
    label: 'OTP',
    icon: <Shield className="w-3 h-3" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-amber-500 to-amber-600',
    position: { top: '52%', right: '2%' },
    delay: 2.3,
    duration: 5.5,
    size: 'sm',
  },
  {
    label: 'Cloud',
    icon: <Cloud className="w-4 h-4" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-slate-500 to-slate-600',
    position: { top: '64%', right: '8%' },
    delay: 2.8,
    duration: 6.5,
    size: 'md',
  },
  {
    label: 'Broadcast',
    icon: <Radio className="w-4 h-4" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-violet-500 to-violet-600',
    position: { top: '75%', right: '3%' },
    delay: 3.3,
    duration: 7,
    size: 'md',
  },
  {
    label: 'Chat',
    icon: <MessageSquare className="w-3 h-3" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-blue-400 to-blue-500',
    position: { top: '85%', right: '6%' },
    delay: 3.8,
    duration: 5,
    size: 'sm',
  },
  {
    label: 'LINE',
    icon: <Hash className="w-3 h-3" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-green-400 to-green-500',
    position: { top: '12%', left: '18%' },
    delay: 4,
    duration: 8,
    size: 'sm',
  },
  {
    label: 'Messenger',
    icon: <MessageCircle className="w-3 h-3" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-blue-600 to-indigo-600',
    position: { top: '22%', right: '18%' },
    delay: 4.5,
    duration: 7.5,
    size: 'sm',
  },
  {
    label: 'Instagram',
    icon: <AtSign className="w-3 h-3" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500',
    position: { top: '60%', left: '15%' },
    delay: 5,
    duration: 6,
    size: 'sm',
  },
  {
    label: 'Signal',
    icon: <Wifi className="w-3 h-3" />,
    color: 'text-white',
    bgColor: 'bg-gradient-to-r from-blue-500 to-blue-600',
    position: { top: '70%', right: '16%' },
    delay: 5.5,
    duration: 7,
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
            absolute rounded-full shadow-lg
            ${badge.bgColor} ${badge.color}
            ${sizeClasses[badge.size]}
            flex items-center
            animate-float
            backdrop-blur-sm
            border border-white/20
          `}
          style={{
            ...badge.position,
            animationDelay: `${badge.delay}s`,
            animationDuration: `${badge.duration}s`,
            boxShadow: '0 4px 15px rgba(0,0,0,0.1), 0 0 20px rgba(59,130,246,0.1)',
          }}
        >
          {badge.icon}
          <span>{badge.label}</span>
        </div>
      ))}
    </div>
  );
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        messign: {
          cyan: '#00D9D5',
          blue: '#3B82F6',
          indigo: '#6366F1',
          purple: '#8B5CF6',
        },
        // Core dark theme
        dark: {
          900: '#0a0a0a',
          800: '#111111',
          700: '#1a1a1a',
          600: '#242424',
          500: '#2e2e2e',
        },
        // Primary colors
        primary: {
          DEFAULT: '#3b82f6',
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Accent purple
        accent: {
          DEFAULT: '#8b5cf6',
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        // Status colors
        success: {
          DEFAULT: '#10b981',
          500: '#10b981',
          600: '#059669',
        },
        warning: {
          DEFAULT: '#f59e0b',
          500: '#f59e0b',
          600: '#d97706',
        },
        danger: {
          DEFAULT: '#ef4444',
          500: '#ef4444',
          600: '#dc2626',
        },
        // Glassmorphism
        glass: {
          bg: 'rgba(255, 255, 255, 0.05)',
          border: 'rgba(255, 255, 255, 0.1)',
          hover: 'rgba(255, 255, 255, 0.08)',
        },
        // Theme-aware (CSS variables); use kebab-case for multi-part names
        app: {
          bg: 'var(--app-bg)',
          sidebar: 'var(--app-sidebar)',
          card: 'var(--app-card)',
          text: 'var(--app-text)',
          muted: 'var(--app-text-muted)',
          'text-secondary': 'var(--app-text-muted)',
          'text-tertiary': 'var(--app-text-tertiary)',
          border: 'var(--app-border)',
          'border-strong': 'var(--app-border-strong)',
          hover: 'var(--app-hover)',
          'surface-tertiary': 'var(--app-surface-tertiary)',
          'nav-hover': 'var(--app-nav-hover)',
          'nav-active-bg': 'var(--app-nav-active-bg)',
          'nav-active-text': 'var(--app-nav-active-text)',
          inputBg: 'var(--input-bg)',
          inputBorder: 'var(--input-border)',
          panelBg: 'var(--panel-bg)',
        },
        // Admin table (theme-aware)
        admin: {
          'table-header-bg': 'var(--admin-table-header-bg)',
          'table-header-text': 'var(--admin-table-header-text)',
          'table-border': 'var(--admin-table-border)',
          'table-row-hover': 'var(--admin-table-row-hover)',
        },
        semantic: {
          primary: { light: '#60A5FA', DEFAULT: '#3B82F6', dark: '#1D4ED8' },
          success: { light: '#34D399', DEFAULT: '#10B981', dark: '#059669' },
          warning: { light: '#FBBF24', DEFAULT: '#F59E0B', dark: '#D97706' },
          danger:  { light: '#F87171', DEFAULT: '#EF4444', dark: '#DC2626' },
          neutral: { light: '#94A3B8', DEFAULT: '#64748B', dark: '#475569' },
        },
      },
      fontSize: {
        xs:   ['12px', { lineHeight: '16px' }],
        sm:   ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg:   ['20px', { lineHeight: '28px' }],
        xl:   ['28px', { lineHeight: '36px' }],
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        full: '9999px',
      },
      transitionDuration: {
        fast: '120ms',
        normal: '220ms',
        slow: '380ms',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        dora: ['DM Sans', 'system-ui', 'sans-serif'],
        'dora-mono': ['JetBrains Mono', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
        xl: '20px',
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'spin-slow': 'spin-slow 10s linear infinite',
        'spin-reverse': 'spin-reverse 15s linear infinite',
        'matrix-fall': 'matrix-fall 10s linear infinite',
        'pulse-ring': 'pulse-ring 4s ease-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'badge-pulse': 'badgePulse 2s ease-in-out infinite',
        'bounce-subtle': 'bounceSubtle 0.5s ease-out',
        'kpi-enter': 'kpiEnter 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'chart-fade': 'chartFade 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'slide-in-right': 'slideInRight 0.25s ease-out',
        'badge-card-enter': 'badgeCardEnter 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'badge-shine': 'badgeShine 5s ease-in-out infinite',
        'icon-pop': 'iconPop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'legendary-pulse': 'legendaryPulse 2s ease-in-out infinite',
        'badge-pulse-ring': 'badgePulseRing 2s ease-out infinite',
        'draw-stroke': 'draw-stroke 1s ease-out forwards',
        'logo-glow': 'logo-glow-pulse 3s ease-in-out infinite',
        'logo-float': 'logo-float 3s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 5s ease infinite',
        'celebration-confetti': 'celebrationConfetti 2.5s ease-out forwards',
      },
      keyframes: {
        'draw-stroke': {
          '0%': { strokeDasharray: '100', strokeDashoffset: '100' },
          '100%': { strokeDasharray: '100', strokeDashoffset: '0' },
        },
        'logo-glow-pulse': {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.05)' },
        },
        'logo-float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        'gradient-shift': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(59, 130, 246, 0.5)' },
          '100%': { boxShadow: '0 0 20px rgba(59, 130, 246, 0.8)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-10px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        kpiEnter: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        chartFade: {
          '0%': { opacity: '1' },
          '100%': { opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        badgeCardEnter: {
          '0%': { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        badgeShine: {
          '0%': { transform: 'translateX(-100%) translateY(-100%) rotate(30deg)' },
          '100%': { transform: 'translateX(100%) translateY(100%) rotate(30deg)' },
        },
        iconPop: {
          '0%': { opacity: '0', transform: 'scale(0) rotate(-180deg)' },
          '70%': { transform: 'scale(1.2) rotate(10deg)' },
          '100%': { opacity: '1', transform: 'scale(1) rotate(0deg)' },
        },
        legendaryPulse: {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%': { opacity: '1', filter: 'brightness(1.1)' },
        },
        badgePulseRing: {
          '0%': { opacity: '0.8', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(1.5)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '25%': { transform: 'translateY(-10px) rotate(2deg)' },
          '50%': { transform: 'translateY(-5px) rotate(-1deg)' },
          '75%': { transform: 'translateY(-15px) rotate(1deg)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(59, 130, 246, 0.4), 0 0 40px rgba(99, 102, 241, 0.2)' },
          '50%': { boxShadow: '0 0 40px rgba(59, 130, 246, 0.6), 0 0 80px rgba(99, 102, 241, 0.4)' },
        },
        spinSlow: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        spinReverse: {
          from: { transform: 'rotate(360deg)' },
          to: { transform: 'rotate(0deg)' },
        },
        matrixFall: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { transform: 'translateY(100vh)', opacity: '0' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.8)', opacity: '1' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
        celebrationConfetti: {
          '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(-100vh) rotate(720deg)', opacity: '0' },
        },
        badgePulse: {
          '0%, 100%': { opacity: '0.7' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

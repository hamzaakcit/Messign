import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    const variants = {
      primary: 'bg-primary-500 hover:bg-primary-600 text-app-text hover:shadow-lg hover:shadow-primary-500/25 focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-app',
      secondary: 'bg-app-card border border-app-border text-app hover:bg-app-surface-tertiary focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-app',
      accent: 'bg-accent-500 hover:bg-accent-600 text-app-text hover:shadow-lg hover:shadow-accent-500/25 focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 focus:ring-offset-app',
      ghost: 'bg-transparent hover:bg-app-hover text-app-muted hover:text-app focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-app',
      danger: 'bg-danger-500 hover:bg-danger-600 text-app-text hover:shadow-lg hover:shadow-danger-500/25 focus:ring-2 focus:ring-danger-500 focus:ring-offset-2 focus:ring-offset-app',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2',
      lg: 'px-6 py-3 text-lg',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';

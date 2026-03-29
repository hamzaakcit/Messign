import { type ReactNode, useId } from 'react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { Controller } from 'react-hook-form';
import { cn } from '@/lib/utils';

interface FloatingLoginFieldProps<T extends FieldValues> {
  name: FieldPath<T>;
  control: Control<T>;
  label: string;
  type?: string;
  autoComplete?: string;
  testId?: string;
  icon: ReactNode;
  showPassword?: boolean;
  onTogglePassword?: () => void;
  togglePasswordLabel?: string;
}

/**
 * Compact floating-label input for the login cockpit (react-hook-form + Controller).
 * Uses value-based float + `.login-float-label` + globals for WebKit autofill.
 */
export function FloatingLoginField<T extends FieldValues>({
  name,
  control,
  label,
  type = 'text',
  autoComplete,
  testId,
  icon,
  showPassword,
  onTogglePassword,
  togglePasswordLabel,
}: FloatingLoginFieldProps<T>): JSX.Element {
  const errId = useId();

  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => {
        const hasErr = Boolean(fieldState.error);
        const inputType =
          type === 'password' && showPassword ? 'text' : type === 'password' ? 'password' : type;
        const isPw = type === 'password';
        const hasValue = String(field.value ?? '').length > 0;

        return (
          <div className="relative">
            <div className="group relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 z-[2] flex items-center pl-3">
                <span className="text-white/35 transition-colors group-focus-within:text-blue-400/90">
                  {icon}
                </span>
              </div>
              <input
                {...field}
                id={field.name}
                data-testid={testId}
                type={inputType}
                value={field.value ?? ''}
                autoComplete={autoComplete}
                aria-invalid={hasErr ? true : undefined}
                aria-describedby={hasErr ? errId : undefined}
                className={cn(
                  'w-full rounded-xl border bg-white/[0.06] pb-2 pl-10 pr-3 pt-5 text-[13px] text-white/95',
                  isPw && onTogglePassword ? 'pr-11' : '',
                  'border-white/[0.1] transition-all duration-300',
                  'focus:border-blue-500/55 focus:outline-none focus:ring-2 focus:ring-blue-500/25',
                  hasErr && 'border-blue-500/50 focus:border-blue-500/60 focus:ring-blue-500/20',
                )}
              />
              <label
                htmlFor={field.name}
                className={cn(
                  'login-float-label pointer-events-none absolute left-10 z-[1] origin-left transition-all duration-200',
                  hasValue
                    ? 'top-2 translate-y-0 text-[11px] font-medium text-white/75'
                    : 'top-1/2 -translate-y-1/2 text-sm text-white/50 group-focus-within:top-2 group-focus-within:translate-y-0 group-focus-within:text-[11px] group-focus-within:font-medium group-focus-within:text-blue-400/90',
                )}
              >
                {label}
              </label>
              {isPw && onTogglePassword ? (
                <button
                  type="button"
                  onClick={onTogglePassword}
                  className="absolute inset-y-0 right-0 z-[2] flex items-center pr-3 text-white/40 transition-colors hover:text-blue-400/90"
                  aria-label={togglePasswordLabel ?? 'Toggle password visibility'}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                      />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              ) : null}
            </div>
            {hasErr ? (
              <p id={errId} className="mt-1.5 text-[11px] text-blue-400">
                {fieldState.error?.message}
              </p>
            ) : null}
          </div>
        );
      }}
    />
  );
}

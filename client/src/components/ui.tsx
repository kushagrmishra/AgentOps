import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import { LiquidMetalButton, type LiquidMetalVariant } from './ui/liquid-metal-button';

// ------------------------------------------------------------------ button

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  variant?: ButtonVariant;
  size?: 'default' | 'sm' | 'lg' | 'icon';
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'sm',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <LiquidMetalButton
      variant={variant as LiquidMetalVariant}
      size={size}
      loading={loading}
      disabled={disabled}
      className={className}
      {...rest}
    >
      {children}
    </LiquidMetalButton>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx('h-3 w-3 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ------------------------------------------------------------------- inputs

const FIELD_STYLES =
  'w-full rounded-md border border-line bg-base px-3 py-2 text-sm text-white placeholder:text-faint/80 ' +
  'transition-colors hover:border-line-strong focus:border-accent focus:outline-none ' +
  'focus:ring-1 focus:ring-accent/40 disabled:opacity-60';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx(FIELD_STYLES, className)} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(FIELD_STYLES, 'resize-y', className)} />;
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="label block">
        {label}
      </label>
      {children}
      {hint && <p className="text-2xs text-faint">{hint}</p>}
    </div>
  );
}

// -------------------------------------------------------------------- misc

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('panel', className)}>{children}</div>;
}

export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/10 px-4 py-3">
      <div>
        <h2 className="retro-title">{title}</h2>
        {subtitle && <p className="mt-0.5 font-mono text-2xs text-faint">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-sm font-medium text-white">{title}</p>
      {description && <p className="max-w-md text-xs text-faint">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2">
      <p className="text-xs text-danger">{message}</p>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry} className="text-danger">
          Retry
        </Button>
      )}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
        checked ? 'border-ok/50 bg-ok/25' : 'border-line-strong bg-raised',
      )}
    >
      <span
        className={cx(
          'absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all',
          checked ? 'left-[1.15rem] bg-ok' : 'left-0.5 bg-faint',
        )}
      />
    </button>
  );
}

/** Monospace block for model output, tool results, and errors. */
export function LogBlock({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  tone?: 'default' | 'danger';
  className?: string;
}) {
  return (
    <pre
      className={cx(
        'log max-h-80 overflow-auto rounded-md border p-3',
        tone === 'danger' ? 'border-danger/30 bg-danger/5 text-danger' : 'border-line bg-base',
        className,
      )}
    >
      {children}
    </pre>
  );
}

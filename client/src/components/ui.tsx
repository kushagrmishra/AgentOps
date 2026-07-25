import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

// ------------------------------------------------------------------ button

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent/85 border-transparent',
  secondary: 'bg-raised text-fg hover:bg-hover border-line-strong',
  ghost: 'bg-transparent text-muted hover:text-fg hover:bg-raised border-transparent',
  danger: 'bg-transparent text-danger hover:bg-danger/10 border-danger/40',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5',
        'text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
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
  'w-full rounded-md border border-line bg-base px-3 py-2 text-sm text-fg placeholder:text-faint ' +
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
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-faint">{subtitle}</p>}
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
      <p className="text-sm font-medium text-muted">{title}</p>
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

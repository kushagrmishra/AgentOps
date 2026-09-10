import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type FrostedGlassCardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  as?: 'article' | 'div' | 'section';
  /** Retro money / ledger tint */
  money?: boolean;
};

export function FrostedGlassCard({
  children,
  className,
  as: Tag = 'article',
  money = false,
  ...rest
}: FrostedGlassCardProps) {
  return (
    <Tag
      className={cn('glass-card group relative overflow-hidden', money && 'money-card', className)}
      {...rest}
    >
      {/* Subtle rim only — no extra frost layers */}
      <div
        className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/15"
        aria-hidden
      />
      <div className="relative z-10">{children}</div>
    </Tag>
  );
}

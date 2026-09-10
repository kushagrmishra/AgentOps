import { Link } from 'react-router-dom';
import { cx } from '../lib/cx';

type LogoProps = {
  to?: string;
  href?: string;
  className?: string;
  showWordmark?: boolean;
};

/** Small circular glass mark for nav chrome. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'liquid-glass inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-1.5 transition-transform group-hover:scale-105',
        className,
      )}
      aria-hidden
    >
      <img
        src="/logo.png"
        alt=""
        width={18}
        height={18}
        className="h-[18px] w-[18px] object-contain"
      />
    </span>
  );
}

/** AgentOps logo — use on every chrome surface (shell, auth, etc.). */
export function Logo({ to = '/runs', href, className, showWordmark = true }: LogoProps) {
  const inner = (
    <>
      <LogoMark />
      {showWordmark && (
        <span className="text-[15px] font-semibold tracking-tight text-fg transition-colors group-hover:text-[var(--spectre-cyan)]">
          AgentOps
        </span>
      )}
    </>
  );

  const classes = cx(
    'group inline-flex items-center gap-2 rounded-md p-1 transition-all hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--spectre-cyan)]',
    className,
  );

  if (href) {
    return (
      <a href={href} className={classes} title="AgentOps Home">
        {inner}
      </a>
    );
  }

  return (
    <Link to={to} className={classes} title="AgentOps Console">
      {inner}
    </Link>
  );
}


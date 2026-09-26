import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../lib/cx';
import { TextScramble } from './core/text-scramble';

type LogoProps = {
  to?: string;
  href?: string;
  className?: string;
  showWordmark?: boolean;
};

/** Logo mark — bare PNG, no circle. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="AgenticX"
      width={36}
      height={36}
      className={cx('h-9 w-9 object-contain', className)}
    />
  );
}

/** Wordmark that scrambles on hover. */
function ScrambleWordmark({ className }: { className?: string }) {
  const [trigger, setTrigger] = useState(false);

  return (
    <TextScramble
      as="span"
      speed={0.01}
      trigger={trigger}
      onHoverStart={() => setTrigger(true)}
      onScrambleComplete={() => setTrigger(false)}
      characterSet="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%"
      className={cx('font-logo text-xl font-bold tracking-normal text-white', className)}
    >
      AgenticX
    </TextScramble>
  );
}

/** AgenticX logo — use on every chrome surface (shell, auth, etc.). */
export function Logo({ to = '/runs', href, className, showWordmark = true }: LogoProps) {
  const inner = (
    <>
      <LogoMark />
      {showWordmark && <ScrambleWordmark />}
    </>
  );

  const classes = cx(
    'inline-flex items-center gap-3 rounded-md p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--spectre-cyan)]',
    className,
  );

  if (href) {
    return (
      <a href={href} className={classes} title="AgenticX Home">
        {inner}
      </a>
    );
  }

  return (
    <Link to={to} className={classes} title="AgenticX Console">
      {inner}
    </Link>
  );
}

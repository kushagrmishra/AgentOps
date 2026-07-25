import { cx } from './ui';
import type { EvalRunStatus, RunStatus, StepStatus, ToolCallStatus } from '../lib/types';

type AnyStatus = RunStatus | StepStatus | EvalRunStatus | ToolCallStatus;

const STATUS_STYLES: Record<string, string> = {
  planning: 'border-violet/40 bg-violet/10 text-violet',
  running: 'border-warn/40 bg-warn/10 text-warn',
  done: 'border-ok/40 bg-ok/10 text-ok',
  failed: 'border-danger/40 bg-danger/10 text-danger',
  pending: 'border-line-strong bg-raised text-faint',
  ok: 'border-ok/40 bg-ok/10 text-ok',
  error: 'border-danger/40 bg-danger/10 text-danger',
  denied: 'border-warn/40 bg-warn/10 text-warn',
};

const LIVE_STATUSES = new Set(['planning', 'running']);

export function StatusBadge({
  status,
  className,
}: {
  status: AnyStatus;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5',
        'font-mono text-2xs uppercase tracking-wide',
        STATUS_STYLES[status] ?? STATUS_STYLES.pending,
        className,
      )}
    >
      <span
        className={cx(
          'h-1.5 w-1.5 rounded-full bg-current',
          LIVE_STATUSES.has(status) && 'animate-pulse-dot',
        )}
      />
      {status}
    </span>
  );
}

export function PassBadge({ passed }: { passed: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-2xs uppercase',
        passed ? STATUS_STYLES.done : STATUS_STYLES.failed,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {passed ? 'pass' : 'fail'}
    </span>
  );
}

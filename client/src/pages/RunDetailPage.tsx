import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import {
  absoluteTime,
  compactNumber,
  duration,
  formatArguments,
  formatMillis,
  relativeTime,
} from '../lib/format';
import type { RunDetail, Step, ToolCall } from '../lib/types';
import { useRunStream } from '../hooks/useRunStream';
import { StatusBadge } from '../components/StatusBadge';
import { Button, Card, ErrorBanner, LogBlock, Spinner } from '../components/ui';
import { cx } from '../lib/cx';

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { run, loading, error, connection } = useRunStream(runId);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-10 text-muted">
        <Spinner />
        <span className="font-mono text-xs">loading run…</span>
      </div>
    );
  }

  if (error && !run) {
    return (
      <div className="space-y-4">
        <ErrorBanner message={error} />
        <Link to="/runs" className="font-mono text-xs text-accent hover:underline">
          ← back to runs
        </Link>
      </div>
    );
  }

  if (!run) return null;

  async function handleDelete() {
    if (!runId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteRun(runId);
      navigate('/runs');
    } catch (caught: unknown) {
      setDeleteError(caught instanceof Error ? caught.message : 'Could not delete the run');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleRerun() {
    if (!run?.goal) return;
    setRerunning(true);
    setRerunError(null);
    try {
      const nextRun = await api.createRun(run.goal);
      navigate(`/runs/${nextRun.id}`);
    } catch (caught: unknown) {
      setRerunError(caught instanceof Error ? caught.message : 'Could not rerun');
      setRerunning(false);
    }
  }

  const active = run.status === 'planning' || run.status === 'running';
  const settled = !active;

  return (
    <div className="space-y-4">
      {deleteError && <ErrorBanner message={deleteError} />}
      {rerunError && <ErrorBanner message={rerunError} />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <Link to="/runs" className="font-mono text-2xs text-faint hover:text-accent">
            ← runs
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={run.status} />
            <span className="font-mono text-2xs text-faint">{run.id}</span>
            {run.source === 'eval' && (
              <span className="rounded border border-violet/40 bg-violet/10 px-1.5 py-0.5 font-mono text-2xs text-violet">
                eval replay
              </span>
            )}
            {active && <StreamIndicator connection={connection} />}
          </div>
          <h1 className="max-w-3xl text-sm font-medium leading-relaxed text-fg">{run.goal}</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleRerun}
            loading={rerunning}
            className="font-mono text-2xs flex items-center gap-1.5"
            title="Rerun this goal with the planning agent"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            Rerun
          </Button>

          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xs text-danger">Delete this run?</span>
              <Button variant="danger" className="px-2 py-1 text-2xs" onClick={handleDelete} loading={deleting}>
                Yes, delete
              </Button>
              <Button variant="ghost" className="px-2 py-1 text-2xs" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)} loading={deleting}>
              Delete run
            </Button>
          )}
        </div>
      </div>

      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line sm:grid-cols-3 lg:grid-cols-6">
        <Meta label="Steps" value={`${run.completed_step_count}/${run.step_count || 0}`} />
        <Meta
          label="Duration"
          value={active ? duration(run.started_at, null) : duration(run.started_at, run.completed_at)}
          tone={active ? 'warn' : undefined}
        />
        <Meta label="Tokens" value={run.total_tokens ? compactNumber(run.total_tokens) : '—'} />
        <Meta label="Provider" value={run.provider ?? '—'} />
        <Meta label="Model" value={run.model ?? '—'} mono />
        <Meta label="Started" value={relativeTime(run.started_at)} title={absoluteTime(run.started_at)} />
      </Card>

      {run.error && (
        <Card className="border-danger/40 p-4">
          <p className="label mb-2 text-danger">Run failed</p>
          <LogBlock tone="danger">{run.error}</LogBlock>
        </Card>
      )}

      <Card>
        <div className="border-b border-line px-4 py-3">
          <p className="label">Planner breakdown</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            {run.planner_summary ??
              (settled ? (
                // A run that died during planning has no breakdown and never will,
                // so showing a spinner here would claim work that is not happening.
                <span className="text-faint">
                  The planner produced no breakdown for this run.
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 text-warn">
                  <Spinner /> the planning agent is decomposing the goal…
                </span>
              ))}
          </p>
        </div>

        {run.steps.length ? (
          <ol className="divide-y divide-line">
            {run.steps.map((step) => (
              <StepRow key={step.id} step={step} runStatus={run.status} />
            ))}
          </ol>
        ) : (
          <div className="px-4 py-8 text-center">
            <p className="font-mono text-xs text-faint">
              {settled ? 'no steps were executed' : 'waiting for the plan…'}
            </p>
          </div>
        )}
      </Card>

      {run.final_output && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="label">Final output</p>
            <CopyButton text={run.final_output} />
          </div>
          <LogBlock className="max-h-none text-fg">{run.final_output}</LogBlock>
        </Card>
      )}
    </div>
  );
}

// ------------------------------------------------------------------- steps

function StepRow({ step, runStatus }: { step: Step; runStatus: RunDetail['status'] }) {
  const active = step.status === 'running';
  // Auto-expand whatever is happening now, plus anything that broke.
  const [open, setOpen] = useState(active || step.status === 'failed');
  const wasActive = useRef(active);

  useEffect(() => {
    if (active) setOpen(true);
    // Collapse a step that just finished, unless the user opened it themselves.
    else if (wasActive.current && step.status === 'done' && runStatus !== 'done') setOpen(false);
    wasActive.current = active;
  }, [active, step.status, runStatus]);

  return (
    <li className={cx('transition-colors', active && 'bg-warn/[0.03]')}>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-raised/40"
      >
        <span className="mt-0.5 font-mono text-2xs text-faint tabular-nums">
          {String(step.index + 1).padStart(2, '0')}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={step.status} />
            <span className="rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-2xs text-accent">
              {step.agent_name}
            </span>
            {Boolean(step.tool_calls.length) && (
              <span className="font-mono text-2xs text-faint">
                {step.tool_calls.length} tool call{step.tool_calls.length === 1 ? '' : 's'}
              </span>
            )}
            {Boolean(step.tokens) && (
              <span className="font-mono text-2xs text-faint">{compactNumber(step.tokens)} tok</span>
            )}
            <span className="font-mono text-2xs text-faint">
              {step.started_at ? duration(step.started_at, step.completed_at) : ''}
            </span>
          </span>
          <span className="mt-1.5 block text-xs leading-relaxed text-fg">{step.title}</span>
        </span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="animate-fade-in space-y-3 border-t border-white/10 bg-black/20 px-4 py-3 pl-12">
          {step.instruction && (
            <Detail label="Instruction">
              <LogBlock className="max-h-40">{step.instruction}</LogBlock>
            </Detail>
          )}

          {Boolean(step.tool_calls.length) && (
            <Detail label={`Tool calls (${step.tool_calls.length})`}>
              <div className="space-y-2">
                {step.tool_calls.map((call) => (
                  <ToolCallRow key={call.id} call={call} />
                ))}
              </div>
            </Detail>
          )}

          {step.error && (
            <Detail label="Error">
              <LogBlock tone="danger">{step.error}</LogBlock>
            </Detail>
          )}

          {step.output ? (
            <Detail label="Output" action={<CopyButton text={step.output} />}>
              <LogBlock className="text-fg">{step.output}</LogBlock>
            </Detail>
          ) : (
            step.status === 'running' && (
              <p className="flex items-center gap-2 font-mono text-2xs text-warn">
                <Spinner /> sub-agent is working…
              </p>
            )
          )}
        </div>
      )}
    </li>
  );
}

function ToolCallRow({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(call.status !== 'ok');

  return (
    <div className="overflow-hidden rounded-md border border-line bg-base">
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-raised/50"
      >
        <StatusBadge status={call.status} />
        <span className="font-mono text-2xs font-medium text-fg">{call.tool_name}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-2xs text-faint">
          {formatArguments(call.arguments)}
        </span>
        <span className="font-mono text-2xs text-faint">{formatMillis(call.duration_ms)}</span>
        <Chevron open={open} />
      </button>

      {open && (
        <div className="animate-fade-in space-y-2 border-t border-white/10 p-2.5">
          <div>
            <p className="label mb-1">Arguments</p>
            <LogBlock className="max-h-40">{JSON.stringify(call.arguments, null, 2)}</LogBlock>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="label">Result</p>
              {call.tool_name === 'write_file' && typeof call.arguments.path === 'string' && (
                <a
                  href={api.downloadFileUrl(call.arguments.path)}
                  download
                  className="font-mono text-2xs text-[var(--spectre-cyan)] hover:underline flex items-center gap-1"
                >
                  📥 Download {call.arguments.path}
                </a>
              )}
            </div>
            <LogBlock tone={call.status === 'ok' ? 'default' : 'danger'} className="max-h-56">
              {call.result ?? call.error ?? '(no result)'}
            </LogBlock>
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- bits

function Detail({
  label,
  action,
  children,
}: {
  label: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="label">{label}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

function Meta({
  label,
  value,
  tone,
  mono,
  title,
}: {
  label: string;
  value: string;
  tone?: 'warn';
  mono?: boolean;
  title?: string;
}) {
  return (
    <div className="bg-white/[0.03] px-3 py-2.5" title={title}>
      <p className="label">{label}</p>
      <p
        className={cx(
          'mt-1 truncate text-xs font-medium',
          mono ? 'font-mono' : 'font-mono',
          tone === 'warn' ? 'text-warn' : 'text-fg',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function StreamIndicator({ connection }: { connection: 'connecting' | 'live' | 'closed' | 'error' }) {
  const config = {
    connecting: { label: 'connecting', className: 'border-line-strong bg-raised text-faint' },
    live: { label: 'live', className: 'border-ok/40 bg-ok/10 text-ok' },
    closed: { label: 'stream closed', className: 'border-line-strong bg-raised text-faint' },
    error: { label: 'polling (stream lost)', className: 'border-warn/40 bg-warn/10 text-warn' },
  }[connection];

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-2xs',
        config.className,
      )}
    >
      <span
        className={cx('h-1.5 w-1.5 rounded-full bg-current', connection === 'live' && 'animate-pulse-dot')}
      />
      {config.label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="font-mono text-2xs text-faint hover:text-accent"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cx('mt-0.5 h-3 w-3 shrink-0 text-faint transition-transform', open && 'rotate-90')}
      aria-hidden="true"
    >
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

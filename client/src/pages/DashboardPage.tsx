import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { compactNumber, duration, relativeTime, truncate } from '../lib/format';
import type { RunStatus, RunSummary } from '../lib/types';
import { isActive, useRuns } from '../hooks/useRuns';
import { StatusBadge } from '../components/StatusBadge';
import { Button, Card, EmptyState, ErrorBanner, Spinner, Textarea, cx } from '../components/ui';

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All' },
  { value: 'planning', label: 'Planning' },
  { value: 'running', label: 'Running' },
  { value: 'done', label: 'Done' },
  { value: 'failed', label: 'Failed' },
];

const EXAMPLE_GOAL =
  'Research the current trade-offs between vector databases for RAG workloads, ' +
  'estimate the monthly cost at 2M queries, and write a recommendation brief.';

export function DashboardPage() {
  const [usage, setUsage] = useState<{ plan: string; usage_runs: number; limit_runs: number; usage_tokens: number; limit_tokens: number } | null>(null);
  useEffect(() => {
    void api.me().then((me) =>
      setUsage({
        plan: me.plan,
        usage_runs: me.usage_runs,
        limit_runs: me.limit_runs,
        usage_tokens: me.usage_tokens,
        limit_tokens: me.limit_tokens,
      }),
    ).catch(() => undefined);
  }, []);

  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const { runs, loading, error, refresh } = useRuns({
    status: statusFilter || undefined,
    source: sourceFilter || undefined,
  });

  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const stats = useMemo(() => summarize(runs), [runs]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = goal.trim();
    if (trimmed.length < 8) {
      setSubmitError('Give the planner at least a sentence to work with.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const run = await api.createRun(trimmed);
      setGoal('');
      navigate(`/runs/${run.id}`);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : 'Could not start the run');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
      {usage && (
        <div className="border-b border-line bg-panel/40 px-4 py-2 text-2xs text-muted">
          Plan <span className="font-mono text-fg">{usage.plan}</span>
          {' · '}
          runs {usage.usage_runs}/{usage.limit_runs}
          {' · '}
          tokens {usage.usage_tokens}/{usage.limit_tokens}
        </div>
      )}

              <h1 className="text-sm font-semibold text-fg">Billing period</h1>
              <button
                type="button"
                onClick={() => setGoal(EXAMPLE_GOAL)}
                className="font-mono text-2xs text-faint hover:text-accent"
              >
                use example goal
              </button>
            </div>
            {submitError && <ErrorBanner message={submitError} />}
            <Textarea
              rows={3}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Describe a high-level goal. The planning agent breaks it into subtasks and delegates each to a sub-agent."
              className="font-mono text-xs"
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  void handleSubmit(event);
                }
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-2xs text-faint">⌘↵ to submit</p>
              <Button type="submit" variant="primary" loading={submitting}>
                Run goal
              </Button>
            </div>
          </form>
        </Card>

        <Card className="grid grid-cols-2 gap-px overflow-hidden bg-line">
          <Stat label="Total runs" value={String(stats.total)} />
          <Stat label="In flight" value={String(stats.active)} tone={stats.active ? 'warn' : undefined} />
          <Stat label="Completed" value={String(stats.done)} tone={stats.done ? 'ok' : undefined} />
          <Stat label="Failed" value={String(stats.failed)} tone={stats.failed ? 'danger' : undefined} />
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-fg">Runs</h2>
            {loading && <Spinner className="text-faint" />}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {STATUS_FILTERS.map((filter) => (
              <FilterChip
                key={filter.value || 'all'}
                active={statusFilter === filter.value}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </FilterChip>
            ))}
            <span className="mx-1 h-4 w-px bg-line" />
            <FilterChip active={sourceFilter === ''} onClick={() => setSourceFilter('')}>
              Any source
            </FilterChip>
            <FilterChip active={sourceFilter === 'manual'} onClick={() => setSourceFilter('manual')}>
              Manual
            </FilterChip>
            <FilterChip active={sourceFilter === 'eval'} onClick={() => setSourceFilter('eval')}>
              Eval
            </FilterChip>
          </div>
        </div>

        {error && (
          <div className="p-4">
            <ErrorBanner message={error} onRetry={refresh} />
          </div>
        )}

        {!error && !runs.length && !loading && (
          <EmptyState
            title={statusFilter || sourceFilter ? 'No runs match this filter' : 'No runs yet'}
            description="Submit a goal above. The planner will decompose it and delegate each subtask to a sub-agent."
          />
        )}

        {Boolean(runs.length) && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wider text-faint">
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Goal</th>
                  <th className="px-4 py-2 font-medium">Steps</th>
                  <th className="px-4 py-2 font-medium">Model</th>
                  <th className="px-4 py-2 font-medium">Tokens</th>
                  <th className="px-4 py-2 font-medium">Duration</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function RunRow({ run }: { run: RunSummary }) {
  const progress = run.step_count ? run.completed_step_count / run.step_count : 0;

  return (
    <tr className="row group transition-colors hover:bg-raised/50">
      <td className="px-4 py-2.5 align-top">
        <StatusBadge status={run.status} />
      </td>
      <td className="max-w-[420px] px-4 py-2.5 align-top">
        <Link to={`/runs/${run.id}`} className="block">
          <span className="text-xs text-fg group-hover:text-accent">{truncate(run.goal, 130)}</span>
          <span className="mt-1 flex items-center gap-2 font-mono text-2xs text-faint">
            {run.id.slice(0, 8)}
            {run.source === 'eval' && (
              <span className="rounded border border-violet/40 bg-violet/10 px-1 text-violet">
                eval replay
              </span>
            )}
          </span>
        </Link>
      </td>
      <td className="px-4 py-2.5 align-top">
        <div className="flex items-center gap-2">
          <span className="font-mono text-2xs text-muted">
            {run.completed_step_count}/{run.step_count || '—'}
          </span>
          {Boolean(run.step_count) && (
            <span className="h-1 w-16 overflow-hidden rounded-full bg-line">
              <span
                className={cx(
                  'block h-full rounded-full transition-all',
                  run.status === 'failed' ? 'bg-danger' : 'bg-ok',
                )}
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5 align-top font-mono text-2xs text-faint">
        {run.provider === 'mock' ? 'mock' : (run.model ?? '—')}
      </td>
      <td className="px-4 py-2.5 align-top font-mono text-2xs text-muted">
        {run.total_tokens ? compactNumber(run.total_tokens) : '—'}
      </td>
      <td className="px-4 py-2.5 align-top font-mono text-2xs text-muted">
        {isActive(run.status) ? (
          <span className="text-warn">{duration(run.started_at, null)}</span>
        ) : (
          duration(run.started_at, run.completed_at)
        )}
      </td>
      <td className="px-4 py-2.5 align-top font-mono text-2xs text-faint">
        {relativeTime(run.created_at)}
      </td>
    </tr>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn' | 'danger';
}) {
  const toneClass =
    tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : 'text-fg';
  return (
    <div className="bg-panel px-4 py-3">
      <p className="label">{label}</p>
      <p className={cx('mt-1 font-mono text-xl font-semibold tabular-nums', toneClass)}>{value}</p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded px-2 py-1 text-2xs font-medium transition-colors',
        active ? 'bg-raised text-fg' : 'text-faint hover:bg-raised/60 hover:text-muted',
      )}
    >
      {children}
    </button>
  );
}

function summarize(runs: RunSummary[]) {
  const counts: Record<RunStatus, number> = { planning: 0, running: 0, done: 0, failed: 0 };
  for (const run of runs) counts[run.status] += 1;
  return {
    total: runs.length,
    active: counts.planning + counts.running,
    done: counts.done,
    failed: counts.failed,
  };
}

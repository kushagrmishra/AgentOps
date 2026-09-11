import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { compactNumber, duration, formatBytes, relativeTime, truncate } from '../lib/format';
import type { FileUploadResponse, RunStatus, RunSummary } from '../lib/types';
import { isActive, useRuns } from '../hooks/useRuns';
import { StatusBadge } from '../components/StatusBadge';
import { Button, Card, EmptyState, ErrorBanner, Spinner, Textarea } from '../components/ui';
import { cx } from '../lib/cx';

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
  const [usage, setUsage] = useState<{
    plan: string;
    plan_display: string;
    platform_key_included: boolean;
    usage_runs: number;
    limit_runs: number;
    usage_tokens: number;
    limit_tokens: number;
    account_kind: 'office' | 'personal';
    is_office_email: boolean;
    email_domain: string | null;
    workspace_kind: 'organization' | 'personal';
  } | null>(null);
  useEffect(() => {
    void api.me().then((me) =>
      setUsage({
        plan: me.plan,
        plan_display: me.plan_display,
        platform_key_included: me.platform_key_included,
        usage_runs: me.usage_runs,
        limit_runs: me.limit_runs,
        usage_tokens: me.usage_tokens,
        limit_tokens: me.limit_tokens,
        account_kind: me.account_kind,
        is_office_email: me.is_office_email,
        email_domain: me.email_domain,
        workspace_kind: me.workspace_kind,
      }),
    ).catch(() => undefined);
  }, []);

  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const { runs, loading, error, refresh, setRuns } = useRuns({
    status: statusFilter || undefined,
    source: sourceFilter || undefined,
  });

  async function handleDeleteRun(runId: string) {
    try {
      await api.deleteRun(runId);
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    } catch (caught) {
      alert(caught instanceof Error ? caught.message : 'Could not delete run');
    }
  }

  async function handleRerun(targetGoal: string) {
    try {
      const nextRun = await api.createRun(targetGoal);
      navigate(`/runs/${nextRun.id}`);
    } catch (caught) {
      alert(caught instanceof Error ? caught.message : 'Could not rerun');
    }
  }

  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [attachedFile, setAttachedFile] = useState<FileUploadResponse | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => summarize(runs), [runs]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const res = await api.uploadFile(file);
      setAttachedFile(res);
      if (!goal.trim() || goal === EXAMPLE_GOAL) {
        setGoal(
          `Analyze the attached file '${res.path}'. Conduct deep analytical research comparing our metrics, features, or pricing against the broader market using web search, and write an executive comparison report.`
        );
      }
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : 'File upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleMarketComparePrompt() {
    if (!attachedFile) return;
    setGoal(
      `Analyze our internal specs in '${attachedFile.path}'. Conduct deep analytical research comparing our metrics, features, and pricing against current market competitors using web search, and produce a detailed comparative report with strategic recommendations.`
    );
  }

  function handleRiskAuditPrompt() {
    const targetPath = attachedFile ? attachedFile.path : 'uploads/q3_quarterly_report.xlsx';
    setGoal(
      `Audit the quarterly report in '${targetPath}'. Authenticate and quantify all critical risk factors: liquidity runway, debt covenant ratios, customer concentration, and cloud infrastructure single points of failure. Calculate exposure metrics and compile a comprehensive Risk Factor Authentication & Mitigation Report.`
    );
  }

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
      setAttachedFile(null);
      navigate(`/runs/${run.id}`);
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : 'Could not start the run');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {usage && (
        <Card className="!p-0">
          <div className="px-4 py-2 font-mono text-2xs text-muted">
            <span className="text-[var(--spectre-cyan)]">PLAN</span>{' '}
            <span className="text-fg">{usage.plan_display}</span>
            {' · '}
            <span className={usage.account_kind === 'office' ? 'text-[var(--spectre-phosphor)]' : 'text-fg'}>
              {usage.account_kind === 'office' ? 'office account' : 'personal account'}
            </span>
            {usage.email_domain ? (
              <>
                {' · '}
                @{usage.email_domain}
                {usage.is_office_email ? ' (work)' : ' (personal mailbox)'}
              </>
            ) : null}
            {' · '}
            {usage.workspace_kind === 'organization' ? 'company org' : 'personal workspace'}
            {' · '}
            {usage.platform_key_included ? 'platform API' : (
              <>
                BYOK · <Link to="/api" className="text-[var(--spectre-cyan)] hover:underline">API</Link>
              </>
            )}
            {' · '}
            runs {usage.usage_runs}/{usage.limit_runs}
            {' · '}
            tokens {usage.usage_tokens}/{usage.limit_tokens}
          </div>
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="retro-kicker">New run</p>
                <h1 className="retro-title mt-1">Dispatch a goal</h1>
              </div>
              <button
                type="button"
                onClick={() => setGoal(EXAMPLE_GOAL)}
                className="font-mono text-2xs text-faint hover:text-[var(--spectre-cyan)]"
              >
                use example goal
              </button>
            </div>
            {submitError && <ErrorBanner message={submitError} />}
            {uploadError && <ErrorBanner message={uploadError} />}

            {attachedFile && (
              <div className="flex flex-col gap-2 rounded border border-[var(--spectre-cyan)]/30 bg-[var(--spectre-cyan)]/5 p-2.5 font-mono text-xs">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-[var(--spectre-cyan)] font-bold">📎 ATTACHED</span>
                    <span className="truncate font-medium text-fg">{attachedFile.filename}</span>
                    <span className="text-faint text-2xs">({formatBytes(attachedFile.size_bytes)})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachedFile(null)}
                    className="text-2xs uppercase text-faint hover:text-[var(--spectre-danger)]"
                  >
                    remove
                  </button>
                </div>
                {attachedFile.preview && (
                  <p className="line-clamp-2 text-2xs text-muted whitespace-pre-wrap">
                    {attachedFile.preview}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-white/5">
                  <button
                    type="button"
                    onClick={handleMarketComparePrompt}
                    className="text-2xs text-[var(--spectre-cyan)] hover:underline flex items-center gap-1"
                  >
                    <span>⚡ Quick prompt:</span>
                    <span>Deep Market Comparison</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRiskAuditPrompt}
                    className="text-2xs text-[var(--spectre-fuchsia)] hover:underline flex items-center gap-1"
                  >
                    <span>⚡ Quick prompt:</span>
                    <span>Quarterly Risk Factor Audit</span>
                  </button>
                </div>
              </div>
            )}

            {!attachedFile && !goal && (
              <div className="flex flex-wrap items-center gap-2 text-2xs text-faint">
                <span>Presets:</span>
                <button
                  type="button"
                  onClick={handleRiskAuditPrompt}
                  className="rounded bg-white/5 px-2 py-0.5 text-xs text-muted hover:bg-white/10 hover:text-fg transition-colors"
                >
                  ⚡ Quarterly Risk Factor Audit (q3_quarterly_report.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setGoal(
                      "Analyze our internal specs in 'uploads/saas_product_metrics.xlsx'. Conduct deep analytical research comparing our metrics against current market competitors using web search, and produce a detailed comparative report with strategic recommendations."
                    )
                  }
                  className="rounded bg-white/5 px-2 py-0.5 text-xs text-muted hover:bg-white/10 hover:text-fg transition-colors"
                >
                  ⚡ SaaS Market Comparison
                </button>
              </div>
            )}

            <Textarea
              rows={3}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="Describe a high-level goal or attach a file above. The planning agent delegates to sub-agents (researcher, analyst, writer)."
              className="font-mono text-xs"
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  void handleSubmit(event);
                }
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".pdf,.csv,.tsv,.xlsx,.xls,.json,.txt,.md,.py,.yaml,.yml"
                />
                <Button
                  type="button"
                  variant="secondary"
                  loading={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="font-mono text-2xs"
                >
                  📎 {attachedFile ? 'Change file' : 'Attach file'}
                </Button>
                <p className="font-mono text-2xs text-faint">⌘↵ to submit</p>
              </div>
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="retro-title">Runs</h2>
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
                  <th className="px-4 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <RunRow
                    key={run.id}
                    run={run}
                    onDelete={() => void handleDeleteRun(run.id)}
                    onRerun={() => void handleRerun(run.goal)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function RunRow({
  run,
  onDelete,
  onRerun,
}: {
  run: RunSummary;
  onDelete: () => void;
  onRerun: () => void;
}) {
  const progress = run.step_count ? run.completed_step_count / run.step_count : 0;
  const [confirming, setConfirming] = useState(false);

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
      <td className="px-4 py-2.5 align-top text-right font-mono text-2xs">
        {confirming ? (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="rounded bg-danger/20 px-1.5 py-0.5 text-danger hover:bg-danger/30 font-medium"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(false);
              }}
              className="rounded px-1.5 py-0.5 text-faint hover:text-muted"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRerun();
              }}
              className="rounded p-1 text-faint hover:bg-raised hover:text-accent opacity-40 group-hover:opacity-100 transition-opacity"
              title="Rerun this goal"
            >
              <svg className="h-3.5 w-3.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(true);
              }}
              className="rounded p-1 text-faint hover:bg-raised hover:text-danger opacity-40 group-hover:opacity-100 transition-opacity"
              title="Delete run"
            >
              <svg className="h-3.5 w-3.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        )}
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
    <div className="bg-white/[0.03] px-4 py-3">
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

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../lib/api';
import { formatMillis, percent, relativeTime, truncate } from '../lib/format';
import { PASS_THRESHOLD } from '../lib/types';
import type { EvalResult, EvalRunDetail, EvalRunSummary, Scenario } from '../lib/types';
import { useEvalRuns, useScenarios } from '../hooks/useEvals';
import { PassBadge, StatusBadge } from '../components/StatusBadge';
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  LogBlock,
  SectionHeader,
  Spinner,
  Textarea,
  Toggle,
  cx,
} from '../components/ui';

export function EvalsPage() {
  const { scenarios, loading: scenariosLoading, error: scenariosError, refresh } = useScenarios();
  const { history, active, error: evalError, start, open } = useEvalRuns();

  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);

  const activeScenarios = scenarios.filter((scenario) => scenario.is_active);
  const suiteRunning = active?.status === 'running';

  async function handleRunEvals() {
    setStarting(true);
    setActionError(null);
    try {
      await start([...selected]);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not start the eval run');
    } finally {
      setStarting(false);
    }
  }

  async function toggleScenario(scenario: Scenario, isActive: boolean) {
    try {
      await api.updateScenario(scenario.id, { is_active: isActive });
      await refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not update the scenario');
    }
  }

  async function deleteScenario(scenario: Scenario) {
    try {
      await api.deleteScenario(scenario.id);
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(scenario.id);
        return next;
      });
      await refresh();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not delete the scenario');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-sm font-semibold text-fg">Evals</h1>
          <p className="mt-0.5 text-xs text-faint">
            Each scenario replays its goal through the full pipeline, then an LLM judge scores the
            output against the expected outcome. Pass threshold {percent(PASS_THRESHOLD)}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setShowForm((previous) => !previous)}>
            {showForm ? 'Cancel' : 'New scenario'}
          </Button>
          <Button
            variant="primary"
            onClick={handleRunEvals}
            loading={starting || suiteRunning}
            disabled={!activeScenarios.length}
            title={
              selected.size
                ? `Run ${selected.size} selected scenario(s)`
                : 'Run every active scenario'
            }
          >
            {suiteRunning
              ? 'Suite running…'
              : selected.size
                ? `Run ${selected.size} selected`
                : 'Run evals'}
          </Button>
        </div>
      </div>

      {(actionError || evalError || scenariosError) && (
        <ErrorBanner message={actionError ?? evalError ?? scenariosError ?? ''} />
      )}

      {showForm && (
        <ScenarioForm
          onCancel={() => setShowForm(false)}
          onCreated={async () => {
            setShowForm(false);
            await refresh();
          }}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <TrendCard history={history} onOpen={open} />
        <SummaryCard active={active} history={history} />
      </div>

      <Card>
        <SectionHeader
          title={`Scenarios (${scenarios.length})`}
          subtitle="Toggle a scenario off to exclude it from the suite. Select rows to run a subset."
          actions={
            selected.size ? (
              <Button variant="ghost" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            ) : undefined
          }
        />

        {scenariosLoading && (
          <div className="flex items-center gap-2 px-4 py-6 text-muted">
            <Spinner />
            <span className="font-mono text-xs">loading scenarios…</span>
          </div>
        )}

        {!scenariosLoading && !scenarios.length && (
          <EmptyState
            title="No scenarios yet"
            description="Add a goal plus the outcome a healthy pipeline should produce."
          />
        )}

        {Boolean(scenarios.length) && (
          <div className="divide-y divide-line">
            {scenarios.map((scenario) => (
              <ScenarioRow
                key={scenario.id}
                scenario={scenario}
                checked={selected.has(scenario.id)}
                lastResult={findLastResult(active, scenario.id)}
                onCheck={(checked) =>
                  setSelected((previous) => {
                    const next = new Set(previous);
                    if (checked) next.add(scenario.id);
                    else next.delete(scenario.id);
                    return next;
                  })
                }
                onToggleActive={(isActive) => void toggleScenario(scenario, isActive)}
                onDelete={() => void deleteScenario(scenario)}
              />
            ))}
          </div>
        )}
      </Card>

      {active && <ResultsCard evalRun={active} />}
    </div>
  );
}

// -------------------------------------------------------------------- trend

function TrendCard({
  history,
  onOpen,
}: {
  history: EvalRunSummary[];
  onOpen: (id: string) => void;
}) {
  const data = useMemo(
    () =>
      history
        .filter((run) => run.status === 'done')
        .slice()
        .reverse()
        .map((run, index) => ({
          id: run.id,
          label: `#${index + 1}`,
          score: Number((run.avg_score * 100).toFixed(1)),
          passRate: run.total ? Number(((run.passed / run.total) * 100).toFixed(1)) : 0,
          when: relativeTime(run.created_at),
        })),
    [history],
  );

  return (
    <Card>
      <SectionHeader
        title="Score trend"
        subtitle="Per completed suite. Click a point to open that suite."
        actions={
          <div className="flex items-center gap-3 font-mono text-2xs text-faint">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded bg-accent" />
              avg score
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded bg-[#a371f7]" />
              pass rate
            </span>
          </div>
        }
      />
      {data.length < 1 ? (
        <EmptyState
          title="No completed suites yet"
          description="Run the evals to start building a trend line."
        />
      ) : (
        <div className="h-56 px-2 py-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 4, right: 12, bottom: 0, left: -22 }}
              onClick={(state) => {
                const index = Number(state?.activeTooltipIndex);
                const point = Number.isInteger(index) ? data[index] : undefined;
                if (point) onOpen(point.id);
              }}
            >
              <CartesianGrid stroke="#232a36" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="#69748a"
                tick={{ fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                stroke="#69748a"
                tick={{ fontSize: 10, fontFamily: 'monospace' }}
                tickLine={false}
                tickFormatter={(value: number) => `${value}%`}
              />
              <ReferenceLine
                y={PASS_THRESHOLD * 100}
                stroke="#3fb950"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
              />
              <Tooltip
                contentStyle={{
                  background: '#10141b',
                  border: '1px solid #2f3846',
                  borderRadius: 6,
                  fontSize: 11,
                  fontFamily: 'monospace',
                }}
                labelStyle={{ color: '#98a2b3' }}
                formatter={(value, name) => [
                  `${String(value)}%`,
                  name === 'score' ? 'avg score' : 'pass rate',
                ]}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#4d8dff"
                strokeWidth={2}
                dot={{ r: 2.5, fill: '#4d8dff' }}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="passRate"
                stroke="#a371f7"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function SummaryCard({
  active,
  history,
}: {
  active: EvalRunDetail | null;
  history: EvalRunSummary[];
}) {
  const latest = active ?? history[0];

  return (
    <Card>
      <SectionHeader
        title="Latest suite"
        subtitle={latest ? `Started ${relativeTime(latest.created_at)}` : 'Nothing has run yet'}
        actions={latest ? <StatusBadge status={latest.status} /> : undefined}
      />
      {!latest ? (
        <EmptyState title="No eval runs yet" />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-px bg-line">
            <Metric label="Avg score" value={percent(latest.avg_score)} tone="accent" />
            <Metric label="Passed" value={String(latest.passed)} tone="ok" />
            <Metric label="Failed" value={String(latest.failed)} tone={latest.failed ? 'danger' : undefined} />
            <Metric label="Total" value={String(latest.total)} />
          </div>
          {latest.status === 'running' && (
            <div className="border-t border-line px-4 py-3">
              <div className="mb-1.5 flex items-center justify-between font-mono text-2xs text-faint">
                <span>
                  scored {latest.passed + latest.failed} of {latest.total || '?'}
                </span>
                <span className="flex items-center gap-1.5 text-warn">
                  <Spinner /> replaying scenarios
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-warn transition-all"
                  style={{
                    width: latest.total
                      ? `${Math.round(((latest.passed + latest.failed) / latest.total) * 100)}%`
                      : '10%',
                  }}
                />
              </div>
            </div>
          )}
          {latest.error && (
            <div className="border-t border-line p-4">
              <LogBlock tone="danger">{latest.error}</LogBlock>
            </div>
          )}
          {history.length > 1 && (
            <div className="border-t border-line px-4 py-3">
              <p className="label mb-2">History</p>
              <div className="space-y-1">
                {history.slice(0, 5).map((run) => (
                  <div key={run.id} className="flex items-center justify-between gap-2 font-mono text-2xs">
                    <span className="flex items-center gap-2">
                      <StatusBadge status={run.status} />
                      <span className="text-faint">{relativeTime(run.created_at)}</span>
                    </span>
                    <span className="text-muted">
                      {percent(run.avg_score)} · {run.passed}/{run.total} passed
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- scenarios

function ScenarioRow({
  scenario,
  checked,
  lastResult,
  onCheck,
  onToggleActive,
  onDelete,
}: {
  scenario: Scenario;
  checked: boolean;
  lastResult: EvalResult | undefined;
  onCheck: (checked: boolean) => void;
  onToggleActive: (isActive: boolean) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={cx('px-4 py-3', !scenario.is_active && 'opacity-55')}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheck(event.target.checked)}
          aria-label={`Select ${scenario.name}`}
          className="mt-1 h-3.5 w-3.5 shrink-0 accent-accent"
        />
        <button
          type="button"
          onClick={() => setExpanded((previous) => !previous)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-fg">{scenario.name}</span>
            {scenario.is_seed && (
              <span className="rounded border border-line-strong px-1 font-mono text-2xs text-faint">
                seed
              </span>
            )}
            {lastResult && (
              <span className="flex items-center gap-1.5">
                <PassBadge passed={lastResult.passed} />
                <span className="font-mono text-2xs text-muted">{percent(lastResult.score)}</span>
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-2xs leading-relaxed text-faint">
            {truncate(scenario.goal, 150)}
          </p>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <Toggle
            checked={scenario.is_active}
            onChange={onToggleActive}
            label={`${scenario.is_active ? 'Disable' : 'Enable'} ${scenario.name}`}
          />
          <Button variant="ghost" onClick={onDelete} className="text-faint hover:text-danger">
            Delete
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="animate-fade-in mt-3 grid gap-3 pl-6 md:grid-cols-2">
          <div>
            <p className="label mb-1">Goal</p>
            <LogBlock className="max-h-40">{scenario.goal}</LogBlock>
          </div>
          <div>
            <p className="label mb-1">Expected outcome</p>
            <LogBlock className="max-h-40">{scenario.expected_outcome}</LogBlock>
          </div>
        </div>
      )}
    </div>
  );
}

function ScenarioForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [expected, setExpected] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createScenario({
        name: name.trim(),
        goal: goal.trim(),
        expected_outcome: expected.trim(),
        is_active: true,
      });
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the scenario');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        {error && <ErrorBanner message={error} />}
        <Field label="Name" htmlFor="scenario-name">
          <Input
            id="scenario-name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Multi-step synthesis"
          />
        </Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Goal" htmlFor="scenario-goal" hint="At least 8 characters.">
            <Textarea
              id="scenario-goal"
              required
              rows={3}
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              className="font-mono text-xs"
              placeholder="Research X, quantify Y, then draft Z."
            />
          </Field>
          <Field
            label="Expected outcome"
            htmlFor="scenario-expected"
            hint="What the judge compares the actual output against."
          >
            <Textarea
              id="scenario-expected"
              required
              rows={3}
              value={expected}
              onChange={(event) => setExpected(event.target.value)}
              className="font-mono text-xs"
              placeholder="A checklist grounded in cited sources, ordered by impact."
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={saving}>
            Create scenario
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ------------------------------------------------------------------ results

function ResultsCard({ evalRun }: { evalRun: EvalRunDetail }) {
  return (
    <Card>
      <SectionHeader
        title="Results"
        subtitle={`Suite ${evalRun.id.slice(0, 8)} · ${evalRun.results.length} scored`}
        actions={<StatusBadge status={evalRun.status} />}
      />
      {!evalRun.results.length ? (
        <div className="flex items-center gap-2 px-4 py-6 text-muted">
          <Spinner />
          <span className="font-mono text-xs">waiting for the first score…</span>
        </div>
      ) : (
        <div className="divide-y divide-line">
          {evalRun.results.map((result) => (
            <ResultRow key={result.id} result={result} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ResultRow({ result }: { result: EvalResult }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-raised/40"
      >
        <PassBadge passed={result.passed} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium text-fg">{result.scenario_name}</span>
          <span className="mt-0.5 block font-mono text-2xs text-faint">
            {truncate(result.judge_reasoning ?? '', 130)}
          </span>
        </span>
        <ScoreBar score={result.score} />
        <span className="hidden font-mono text-2xs text-faint sm:inline">
          {formatMillis(result.duration_ms)}
        </span>
      </button>

      {open && (
        <div className="animate-fade-in space-y-3 border-t border-line/60 bg-base/40 px-4 py-3">
          {result.run_id && (
            <Link
              to={`/runs/${result.run_id}`}
              className="inline-block font-mono text-2xs text-accent hover:underline"
            >
              → inspect the replayed run
            </Link>
          )}
          {result.judge_reasoning && (
            <div>
              <p className="label mb-1">Judge reasoning</p>
              <LogBlock className="max-h-40">{result.judge_reasoning}</LogBlock>
            </div>
          )}
          {result.actual_output && (
            <div>
              <p className="label mb-1">Actual output</p>
              <LogBlock className="max-h-56">{result.actual_output}</LogBlock>
            </div>
          )}
          {result.error && (
            <div>
              <p className="label mb-1 text-danger">Error</p>
              <LogBlock tone="danger">{result.error}</LogBlock>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const passed = score >= PASS_THRESHOLD;
  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-line">
        <span
          className={cx('block h-full rounded-full', passed ? 'bg-ok' : 'bg-danger')}
          style={{ width: `${Math.round(score * 100)}%` }}
        />
      </span>
      <span
        className={cx(
          'w-9 text-right font-mono text-2xs tabular-nums',
          passed ? 'text-ok' : 'text-danger',
        )}
      >
        {percent(score)}
      </span>
    </span>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'danger' | 'accent';
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-ok'
      : tone === 'danger'
        ? 'text-danger'
        : tone === 'accent'
          ? 'text-accent'
          : 'text-fg';
  return (
    <div className="bg-panel px-3 py-3">
      <p className="label">{label}</p>
      <p className={cx('mt-1 font-mono text-lg font-semibold tabular-nums', toneClass)}>{value}</p>
    </div>
  );
}

/** Score for a scenario from the suite currently on screen, if it has one yet. */
function findLastResult(
  active: EvalRunDetail | null,
  scenarioId: string,
): EvalResult | undefined {
  return active?.results.find((result) => result.scenario_id === scenarioId);
}

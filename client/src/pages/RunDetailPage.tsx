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
import { useLlmSettings } from '../hooks/useLlmSettings';
import { StatusBadge } from '../components/StatusBadge';
import { Card, ErrorBanner, LogBlock, Spinner } from '../components/ui';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { LiquidMetalButton } from '../components/ui/liquid-metal-button';
import {
  Download,
  Copy,
  Check,
  RotateCcw,
  Trash2,
  X,
  Presentation,
  Layers,
  FileText,
  FileDown,
  Eye,
  Code,
  Folder,
} from 'lucide-react';
import { cx } from '../lib/cx';

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const { run, loading, error, connection } = useRunStream(runId);
  const { settings } = useLlmSettings();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const [outputView, setOutputView] = useState<'rendered' | 'raw'>('rendered');

  const generatedFiles =
    run?.steps?.flatMap((s) =>
      s.tool_calls
        .filter((tc) => tc.tool_name === 'write_file' && typeof tc.arguments?.path === 'string')
        .map((tc) => ({
          path: tc.arguments.path as string,
          status: tc.status,
          stepTitle: s.title,
        }))
    ) || [];
  const uniqueGeneratedFiles = Array.from(
    new Map(generatedFiles.map((f) => [f.path, f])).values()
  );

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
      const selectedModel =
        settings?.model || localStorage.getItem('agentops_selected_model') || undefined;
      const nextRun = await api.createRun(run.goal, {
        model: selectedModel,
        previous_run_id: run.id,
      });
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
          <LiquidMetalButton
            size="sm"
            label="Rerun"
            icon={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={handleRerun}
            loading={rerunning}
            title={settings?.model ? `Rerun this goal with ${settings.model}` : 'Rerun this goal'}
          />

          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xs text-danger">Delete this run?</span>
              <LiquidMetalButton
                size="sm"
                variant="danger"
                label="Yes, delete"
                icon={<Trash2 className="w-3.5 h-3.5" />}
                onClick={handleDelete}
                loading={deleting}
              />
              <LiquidMetalButton
                size="sm"
                variant="ghost"
                label="Cancel"
                icon={<X className="w-3.5 h-3.5" />}
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              />
            </div>
          ) : (
            <LiquidMetalButton
              size="sm"
              variant="danger"
              label="Delete run"
              icon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => setConfirmDelete(true)}
              loading={deleting}
            />
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

      {uniqueGeneratedFiles.length > 0 && (
        <Card className="p-4 border-[var(--spectre-cyan)]/30">
          <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-[var(--spectre-cyan)]" />
              <p className="label text-[var(--spectre-cyan)]">
                Generated Deliverables ({uniqueGeneratedFiles.length})
              </p>
            </div>
            <span className="font-mono text-2xs text-faint">Saved to workspace</span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {uniqueGeneratedFiles.map((file) => {
              const fileName = file.path.split('/').pop() || file.path;
              const isMarkdown = fileName.toLowerCase().endsWith('.md');
              const isHtml = fileName.toLowerCase().endsWith('.html');
              const isPptx = fileName.toLowerCase().endsWith('.pptx');
              const isDocx = fileName.toLowerCase().endsWith('.docx');
              const isPdf = fileName.toLowerCase().endsWith('.pdf');
              return (
                <div
                  key={file.path}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-base/60 p-3 hover:border-white/20 transition-colors"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-fg font-medium truncate" title={file.path}>
                        {fileName}
                      </span>
                      {isMarkdown && (
                        <span className="shrink-0 rounded bg-[var(--spectre-cyan)]/15 border border-[var(--spectre-cyan)]/30 px-1.5 py-0.2 font-mono text-2xs text-[var(--spectre-cyan)]">
                          .md
                        </span>
                      )}
                      {isHtml && (
                        <span className="shrink-0 rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 font-mono text-2xs text-emerald-400 font-semibold inline-flex items-center gap-1">
                          <Presentation className="w-3 h-3" /> slide deck
                        </span>
                      )}
                      {isPptx && (
                        <span className="shrink-0 rounded bg-blue-500/15 border border-blue-500/30 px-1.5 py-0.2 font-mono text-2xs text-blue-400 font-semibold inline-flex items-center gap-1">
                          <Layers className="w-3 h-3" /> pptx
                        </span>
                      )}
                      {isDocx && (
                        <span className="shrink-0 rounded bg-indigo-500/15 border border-indigo-500/30 px-1.5 py-0.2 font-mono text-2xs text-indigo-400 font-semibold inline-flex items-center gap-1">
                          <FileText className="w-3 h-3" /> docx
                        </span>
                      )}
                      {isPdf && (
                        <span className="shrink-0 rounded bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.2 font-mono text-2xs text-rose-400 font-semibold inline-flex items-center gap-1">
                          <FileDown className="w-3 h-3" /> pdf
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-2xs text-muted truncate">from {file.stepTitle}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isHtml && (
                      <LiquidMetalButton
                        size="sm"
                        label="Present"
                        variant="primary"
                        icon={<Presentation className="w-3.5 h-3.5" />}
                        onClick={() => window.open(api.downloadFileUrl(file.path), '_blank')}
                        title="Open interactive animated presentation deck in new tab"
                      />
                    )}
                    <LiquidMetalButton
                      size="sm"
                      label="Download"
                      icon={<Download className="w-3.5 h-3.5" />}
                      onClick={() => {
                        void api.downloadWorkspaceFile(file.path).catch((err) => {
                          alert(err instanceof Error ? err.message : 'Download failed');
                        });
                      }}
                      title={`Download ${fileName}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {run.final_output && (
        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2.5">
              <p className="label">Final Output</p>
              <span className="rounded bg-ok/10 border border-ok/30 px-1.5 py-0.2 font-mono text-2xs text-ok">
                Markdown
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <LiquidMetalButton
                  size="sm"
                  label="Preview"
                  icon={<Eye className="w-3.5 h-3.5" />}
                  variant={outputView === 'rendered' ? 'primary' : 'ghost'}
                  onClick={() => setOutputView('rendered')}
                />
                <LiquidMetalButton
                  size="sm"
                  label="Raw"
                  icon={<Code className="w-3.5 h-3.5" />}
                  variant={outputView === 'raw' ? 'primary' : 'ghost'}
                  onClick={() => setOutputView('raw')}
                />
              </div>
              <CopyButton text={run.final_output} />
              <DownloadMarkdownButton
                content={run.final_output}
                filename={`${run.goal.slice(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'report'}.md`}
              />
              <ExportButtonGroup runId={run.id} content={run.final_output} title={run.goal} />
            </div>
          </div>
          {outputView === 'rendered' ? (
            <div className="rounded-lg border border-white/5 bg-[#080b12]/80 p-4">
              <MarkdownRenderer content={run.final_output} />
            </div>
          ) : (
            <LogBlock className="max-h-none text-fg">{run.final_output}</LogBlock>
          )}
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
                <LiquidMetalButton
                  size="sm"
                  label={`Download ${call.arguments.path.split('/').pop()}`}
                  icon={<Download className="w-3.5 h-3.5" />}
                  onClick={() => {
                    void api.downloadWorkspaceFile(call.arguments.path as string).catch((err) => {
                      alert(err instanceof Error ? err.message : 'Download failed');
                    });
                  }}
                  title={`Download ${call.arguments.path}`}
                />
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
    <LiquidMetalButton
      size="sm"
      label={copied ? 'Copied' : 'Copy'}
      icon={copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
      title="Copy raw markdown to clipboard"
    />
  );
}

function DownloadMarkdownButton({ content, filename }: { content: string; filename: string }) {
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.md') ? filename : `${filename}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
    window.setTimeout(() => setDownloaded(false), 1500);
  };

  return (
    <LiquidMetalButton
      size="sm"
      label={downloaded ? 'Saved' : 'Download .md'}
      icon={downloaded ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5" />}
      onClick={handleDownload}
      title="Download as Markdown file"
    />
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

function ExportButtonGroup({
  runId,
  content: _content,
  title,
}: {
  runId: string;
  content?: string;
  title: string;
}) {
  const [exporting, setExporting] = useState<string | null>(null);

  async function handleExport(format: 'pptx' | 'docx' | 'pdf' | 'html') {
    setExporting(format);
    try {
      if (format === 'html') {
        await api.openFileInNewTab(api.exportRunUrl(runId, 'html'), `${title || 'presentation'}.html`);
      } else {
        await api.downloadFile(api.exportRunUrl(runId, format), `report.${format}`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <LiquidMetalButton
        size="sm"
        label={exporting === 'html' ? 'Exporting...' : 'Animated PPT'}
        icon={exporting === 'html' ? <Spinner /> : <Presentation className="w-3.5 h-3.5 text-cyan-400" />}
        onClick={() => handleExport('html')}
        disabled={exporting !== null}
        title="Launch or download extreme animated HTML presentation deck"
      />

      <LiquidMetalButton
        size="sm"
        label={exporting === 'pptx' ? 'Exporting...' : 'PPTX'}
        icon={exporting === 'pptx' ? <Spinner /> : <Layers className="w-3.5 h-3.5 text-blue-400" />}
        onClick={() => handleExport('pptx')}
        disabled={exporting !== null}
        title="Download 16:9 widescreen PowerPoint presentation"
      />

      <LiquidMetalButton
        size="sm"
        label={exporting === 'docx' ? 'Exporting...' : 'Word'}
        icon={exporting === 'docx' ? <Spinner /> : <FileText className="w-3.5 h-3.5 text-indigo-400" />}
        onClick={() => handleExport('docx')}
        disabled={exporting !== null}
        title="Download executive Word document with cover page and tables"
      />

      <LiquidMetalButton
        size="sm"
        label={exporting === 'pdf' ? 'Exporting...' : 'PDF'}
        icon={exporting === 'pdf' ? <Spinner /> : <FileDown className="w-3.5 h-3.5 text-rose-400" />}
        onClick={() => handleExport('pdf')}
        disabled={exporting !== null}
        title="Download publication-quality executive PDF"
      />
    </div>
  );
}


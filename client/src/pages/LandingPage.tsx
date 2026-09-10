import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { cx } from '../lib/cx';

const TRACE_ROWS = [
  { role: 'planner', detail: 'claude-sonnet-4-5 · decompose goal', tokens: '412 tok', status: 'ok' },
  { role: 'sub#1', detail: 'research: identify KPIs', tokens: '234 tok', status: 'ok' },
  { role: 'sub#2', detail: 'tool:web_search · fetch metrics', tokens: '891 tok', status: 'ok' },
  { role: 'sub#3', detail: 'analyst: reconcile trade-offs', tokens: '640 tok', status: 'ok' },
  { role: 'sub#4', detail: 'writer: recommendation brief', tokens: '518 tok', status: 'ok' },
  { role: 'eval', detail: 'judge · score vs expected', tokens: '186 tok', status: 'ok' },
] as const;

const PRIMITIVES = [
  {
    title: 'Planning agent',
    body: 'Decompose fuzzy goals into ordered subtasks. Version prompts, swap models, replay plans deterministically.',
    icon: (
      <path
        d="M4 6h16M4 12h10M4 18h14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    ),
  },
  {
    title: 'Tool-calling sub-agents',
    body: 'Sub-agents invoke your tools with typed schemas. Every call is logged, retryable, and inspectable.',
    icon: (
      <path
        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
  {
    title: 'Live trace tree',
    body: 'Watch the whole orchestration unfold in a nested tree. Click any node to see raw JSON I/O.',
    icon: (
      <path
        d="M6 3v12M6 9h6M12 9v6M12 15h6M18 12v6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: 'Eval harness',
    body: 'Score runs 0–100 against a dataset. Track regressions across prompts, tools and models.',
    icon: (
      <path
        d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
  {
    title: 'Prompt & dataset library',
    body: 'Version-controlled prompts and datasets. Bring your own eval samples or generate synthetics.',
    icon: (
      <path
        d="M8 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm2 4h4M10 12h4M10 16h2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
  {
    title: 'Cost & latency accounting',
    body: 'Per-run token and USD accounting. Never ship a $17 request to prod again.',
    icon: (
      <path
        d="M12 3v18M17 8c0-1.7-2.2-3-5-3s-5 1.3-5 3 2.2 3 5 3 5 1.3 5 3-2.2 3-5 3-5-1.3-5-3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    ),
  },
] as const;

function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx('inline-flex items-center gap-2', className)}>
      <span
        className="liquid-glass inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full p-1.5"
        aria-hidden
      >
        <img src="/logo.png" alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-fg">AgentOps</span>
    </Link>
  );
}

const LOGIN_TO_DASHBOARD = { from: '/runs' } as const;

function LandingNav() {
  return (
    <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
      <Logo />
      <div className="flex items-center gap-3">
        <Link
          to="/login"
          state={LOGIN_TO_DASHBOARD}
          className="px-2 py-1.5 text-sm text-muted transition-colors hover:text-fg"
        >
          Sign In
        </Link>
        <Link
          to="/login"
          state={LOGIN_TO_DASHBOARD}
          className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/85"
        >
          Get started
        </Link>
      </div>
    </header>
  );
}

function TraceWindow() {
  return (
    <div
      className={cx(
        'landing-fade-up mx-auto mt-14 w-full max-w-3xl overflow-hidden rounded-xl',
        'border border-line-strong/80 bg-panel/90 shadow-[0_30px_80px_-40px_rgba(77,141,255,0.45)]',
        'backdrop-blur-sm',
      )}
      style={{ animationDelay: '180ms' }}
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 font-mono text-2xs text-faint">agentops run trace</span>
      </div>
      <div className="divide-y divide-line/60 font-mono text-[11px] leading-5 sm:text-xs">
        {TRACE_ROWS.map((row, index) => (
          <div
            key={row.role + row.detail}
            className="landing-fade-up grid grid-cols-[4.5rem_1fr_auto_auto] items-center gap-3 px-4 py-2.5 text-muted sm:grid-cols-[5.5rem_1fr_auto_auto]"
            style={{ animationDelay: `${220 + index * 45}ms` }}
          >
            <span className="text-accent">{row.role}</span>
            <span className="truncate text-fg/85">{row.detail}</span>
            <span className="hidden text-faint sm:inline">{row.tokens}</span>
            <span className="text-ok">{row.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LandingPage() {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return <Navigate to="/runs" replace />;
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-base text-fg">
      {/* Atmosphere: grid + corner glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(35,42,54,0.35)_1px,transparent_1px),linear-gradient(to_bottom,rgba(35,42,54,0.35)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 top-0 h-[28rem] w-[28rem] rounded-full bg-accent/20 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 top-40 h-[22rem] w-[22rem] rounded-full bg-ok/10 blur-[110px]"
      />

      <LandingNav />

      <main>
        {/* Hero */}
        <section className="relative z-10 mx-auto max-w-4xl px-6 pb-20 pt-10 text-center sm:pt-16">
          <div
            className="landing-fade-up inline-flex items-center gap-2 rounded-full border border-line bg-panel/80 px-3 py-1 font-mono text-2xs text-muted"
          >
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-ok" />
            v0.1 · production trace harness live
          </div>

          <h1
            className="landing-fade-up mt-7 text-4xl font-semibold tracking-tight text-fg sm:text-5xl sm:leading-[1.1]"
            style={{ animationDelay: '60ms' }}
          >
            Ship multi-agent systems{' '}
            <span className="text-muted">you can</span>{' '}
            <span className="text-accent">actually debug.</span>
          </h1>

          <p
            className="landing-fade-up mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-muted sm:text-[15px]"
            style={{ animationDelay: '110ms' }}
          >
            AgentOps is a control plane for planning agents, tool-calling sub-agents, and
            evaluation runs. Trace every step, score every output, iterate on prompts and
            datasets — from your laptop to prod.
          </p>

          <div
            className="landing-fade-up mt-8 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: '150ms' }}
          >
            <Link
              to="/login"
              state={LOGIN_TO_DASHBOARD}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/85"
            >
              Start orchestrating
              <span aria-hidden>→</span>
            </Link>
            <Link
              to="/login"
              state={LOGIN_TO_DASHBOARD}
              className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-transparent px-4 py-2.5 font-mono text-sm text-fg transition-colors hover:bg-raised"
            >
              <span className="text-faint" aria-hidden>
                &gt;_
              </span>
              Sign in
            </Link>
          </div>

          <TraceWindow />
        </section>

        {/* Primitives */}
        <section className="relative z-10 border-t border-line/70 bg-base/40 px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <p className="font-mono text-2xs font-medium uppercase tracking-[0.18em] text-accent">
              02 · Primitives
            </p>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              Every primitive you need to run agents in production.
            </h2>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PRIMITIVES.map((item) => (
                <article
                  key={item.title}
                  className="rounded-xl border border-line bg-panel/60 p-5 transition-colors hover:border-line-strong hover:bg-raised/50"
                >
                  <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent ring-1 ring-accent/25">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      {item.icon}
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-fg">{item.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="relative z-10 border-t border-line/70 px-6 py-16">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
                Stop guessing. Start tracing.
              </h2>
              <p className="mt-2 text-sm text-muted">Free while in preview. No credit card.</p>
            </div>
            <Link
              to="/login"
              state={LOGIN_TO_DASHBOARD}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-accent/85"
            >
              Sign in to dashboard
              <span aria-hidden>→</span>
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-line/70 px-6 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-2xs text-faint">
          <span>© {new Date().getFullYear()} AgentOps</span>
          <span>built for AI/ML engineers</span>
        </div>
      </footer>
    </div>
  );
}

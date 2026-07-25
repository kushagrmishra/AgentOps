export function LandingPage({ appUrl }: { appUrl: string }) {
  return (
    <main>
      <section className="relative mx-auto max-w-4xl px-6 pb-20 pt-16 text-center">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(77,141,255,0.12),transparent_55%)]" />
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-panel/80 px-3 py-1 font-mono text-[11px] text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          production trace harness
        </p>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
          Ship multi-agent systems{' '}
          <span className="text-muted">you can</span>{' '}
          <span className="text-accent">actually debug.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-muted sm:text-[15px]">
          AgentOps is the control plane for planning agents, tool-calling sub-agents, and evaluation
          runs. Trace every step, score every output, meter usage — from laptop to prod.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href={`${appUrl}/sign-up`} className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white">
            Start orchestrating →
          </a>
          <a href={`${appUrl}/sign-in`} className="rounded-lg border border-line px-4 py-2.5 font-mono text-sm">
            &gt;_ Sign in
          </a>
        </div>
        <div className="mx-auto mt-14 overflow-hidden rounded-xl border border-line bg-panel text-left shadow-2xl">
          <div className="border-b border-line px-4 py-2 font-mono text-[11px] text-faint">agentops run trace</div>
          <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-5 text-muted">{`planner   decompose goal                         ok
sub#1     research: identify KPIs                 ok
sub#2     tool:web_search · fetch metrics         ok
eval      judge · score vs expected               ok`}</pre>
        </div>
      </section>

      <section className="border-t border-line px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">02 · Primitives</p>
          <h2 className="mt-3 max-w-xl text-3xl font-semibold">Every primitive to run agents in production.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ['Planning agent', 'Decompose goals into ordered subtasks with assigned sub-agents.'],
              ['Live trace', 'Inspect every tool call, argument, and raw response.'],
              ['Eval harness', 'Replay scenarios and trend pass rate over time.'],
              ['Org & roles', 'Clerk orgs with owner / admin / member gates.'],
              ['Billing meters', 'Stripe plans with server-enforced monthly quotas.'],
              ['E2B sandboxes', 'run_code never executes on the API host.'],
            ].map(([title, body]) => (
              <article key={title} className="rounded-xl border border-line bg-panel/60 p-5">
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

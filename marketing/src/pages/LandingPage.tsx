import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LiquidButton } from '@/components/ui/liquid-glass-button';
import { FrostedGlassCard } from '@/components/ui/frosted-glass-card';
import { MotionAccordion } from '@/components/ui/motion-accordion';

/** Single fade-in when the section enters view — one motion per section. */
function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={visible ? 'reveal reveal-in' : 'reveal'}>
      {children}
    </div>
  );
}

const PRIMITIVES = [
  ['Planning agent', 'Decomposes a goal into ordered subtasks and assigns each to a sub-agent.'],
  ['Tool-calling sub-agents', 'Each sub-agent runs tools with full argument and response capture.'],
  ['Live run traces', 'Inspect every step, tool call, and raw payload for a single run.'],
  ['Eval harness', 'Replay scenarios, score outputs, and chart pass rate over time.'],
  ['Org roles', 'Clerk orgs with owner / admin / member gates on the API.'],
  ['E2B sandboxes', 'run_code executes in E2B — never with exec on the API host.'],
] as const;

const FAQ = [
  {
    q: 'What does a run look like?',
    a: 'You submit a goal. A planning agent breaks it into subtasks; sub-agents call tools; AgentOps stores the full step and tool-call trace so you can open any run and see exactly what happened.',
  },
  {
    q: 'How do orgs and permissions work?',
    a: 'Identity and membership come from Clerk. Runs, agents, and evals are scoped to an org. Owner and admin roles can change billing and settings; members can create and inspect runs.',
  },
  {
    q: 'Can agents run code safely?',
    a: 'Yes. When E2B is configured, run_code tools execute inside an E2B sandbox. The AgentOps API host never evals or execs user code.',
  },
  {
    q: 'How does billing work?',
    a: 'Individual plans are Free, Pro, and Max. Team and Enterprise cover company orgs.Paid plans include the platform Anthropic key.',
  },
  {
    q: 'Do I need my own Anthropic key?',
    a: 'On Free you paste your Anthropic key under API. Pro, Max, Team, and Enterprise use AgentOps platform key.',
  },
] as const;

export function LandingPage({ appUrl }: { appUrl: string }) {
  return (
    <main className="relative">
      {/* Hero */}
      <section className="relative mx-auto max-w-4xl px-6 py-24 text-center">
        <div className="hero-rise">
          <p className="glass-card inline-flex items-center gap-2 !rounded-full !px-3 !py-1 font-mono text-sm text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--spectre-cyan)] shadow-[0_0_10px_var(--spectre-cyan)]" aria-hidden />
            Plan · tool calls · evals
          </p>
          <h1 className="spectre-title mt-6 text-4xl sm:text-5xl">
            Ship multi-agent systems you can{' '}
            <span className="bg-gradient-to-r from-[var(--spectre-cyan)] via-accent to-[var(--spectre-magenta)] bg-clip-text text-transparent">
              actually debug.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-muted sm:text-[15px]">
            AgentOps is the control plane for a planning agent, tool-calling sub-agents, and an eval
            harness. Trace every step, score every output, and meter usage — from laptop to prod.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <LiquidButton
              size="xl"
              className="px-8"
              onClick={() => {
                window.location.href = `${appUrl}/sign-up`;
              }}
            >
              Start free
            </LiquidButton>
            <LiquidButton
              size="xl"
              className="px-8 text-white/90"
              onClick={() => {
                window.location.href = `${appUrl}/sign-in`;
              }}
            >
              Sign in
            </LiquidButton>
          </div>
        </div>

        <FrostedGlassCard
          className="hero-rise mx-auto mt-14 !p-0 text-left"
          style={{ animationDelay: '120ms' }}
        >
          <div className="border-b border-white/10 px-4 py-2 font-mono text-sm text-[var(--spectre-cyan)]/80">
            agentops run trace
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-sm leading-6 text-muted">{`
planner   decompose goal                          200 OK
sub#1     research: identify KPIs                 200 OK
sub#2     tool:web_search · fetch metrics         200 OK
eval      judge · score vs expected               200 OK`}</pre>
        </FrostedGlassCard>
      </section>

      {/* Primitives */}
      <section className="relative border-t border-white/10 px-6 py-24">
        <Reveal>
          <div className="mx-auto max-w-6xl">
            <p className="spectre-eyebrow">Primitives</p>
            <h2 className="spectre-title mt-3 max-w-xl text-2xl sm:text-3xl">
              Planning, traces, and evals — scoped to your org.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              Each piece maps to a real surface in the product: the planner, the run detail view, the
              eval harness, Clerk roles, Stripe quotas, and E2B tool execution.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {PRIMITIVES.map(([title, body]) => (
                <FrostedGlassCard key={title}>
                  <h3 className="font-mono text-sm font-semibold tracking-wide text-[var(--spectre-cyan)]">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
                </FrostedGlassCard>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="relative border-t border-white/10 px-6 py-24" id="faq">
        <Reveal>
          <div className="mx-auto max-w-3xl">
            <p className="spectre-eyebrow">FAQ</p>
            <h2 className="spectre-title mt-3 text-2xl sm:text-3xl">
              Concrete answers, not marketing filler.
            </h2>
            <MotionAccordion
              className="mt-10"
              items={FAQ.map(({ q, a }) => ({
                question: q,
                answer: a,
              }))}
            />
          </div>
        </Reveal>
      </section>

      {/* Closing CTA */}
      <section className="relative border-t border-white/10 px-6 py-24">
        <Reveal>
          <FrostedGlassCard className="mx-auto max-w-3xl text-center" as="div">
            <h2 className="spectre-title text-2xl sm:text-3xl">
              Run your first traced goal today.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
              Create a free org, submit a goal, and open the run detail view — planner steps, tool
              calls, and eval scores in one place.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <LiquidButton
                size="xl"
                className="px-8"
                onClick={() => {
                  window.location.href = `${appUrl}/sign-up`;
                }}
              >
                Start free
              </LiquidButton>
              <LiquidButton
                size="xl"
                className="px-8 text-white/90"
                onClick={() => {
                  window.location.href = '/pricing';
                }}
              >
                View pricing
              </LiquidButton>
            </div>
          </FrostedGlassCard>
        </Reveal>
      </section>
    </main>
  );
}

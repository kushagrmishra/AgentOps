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
    a: 'You submit a goal. A planning agent breaks it into subtasks; sub-agents call tools; AgenticX stores the full step and tool-call trace so you can open any run and see exactly what happened.',
  },
  {
    q: 'How do orgs and permissions work?',
    a: 'Identity and membership come from Clerk. Runs, agents, and evals are scoped to an org. Owner and admin roles can change billing and settings; members can create and inspect runs.',
  },
  {
    q: 'Can agents run code safely?',
    a: 'Yes. When E2B is configured, run_code tools execute inside an E2B sandbox. The AgenticX API host never evals or execs user code.',
  },
  {
    q: 'How does billing work?',
    a: 'Individual plans are Free, Pro, and Max. Team and Enterprise cover company orgs. Paid plans include the platform API key.',
  },
  {
    q: 'Do I need my own API key?',
    a: 'On Free you can bring your favourite API key under API settings. Pro, Max, Team, and Enterprise can also use the AgenticX platform key.',
  },
] as const;

export function LandingPage({ appUrl }: { appUrl: string }) {
  return (
    <main className="relative w-full">
      {/* Hero */}
      <section className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-16 pb-24 text-center">
        <div className="hero-rise">
          <p className="glass-card inline-flex items-center gap-2 !rounded-full !px-3.5 !py-1 font-mono text-xs sm:text-sm text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--spectre-cyan)] shadow-[0_0_10px_var(--spectre-cyan)]" aria-hidden />
            Plan · tool calls · evals
          </p>
          <h1 className="spectre-title mt-6 text-4xl sm:text-5xl md:text-6xl text-white font-bold tracking-tight max-w-3xl mx-auto leading-[1.12]">
            Ship multi-agent systems you can{' '}
            <span className="bg-gradient-to-r from-[var(--spectre-cyan)] via-accent to-[var(--spectre-magenta)] bg-clip-text text-transparent">
              actually debug.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-sm sm:text-[15px] leading-relaxed !text-white font-normal drop-shadow-sm">
            AgenticX is the control plane for a planning agent, tool-calling sub-agents, and an eval
            harness. Trace every step, score every output, and meter usage — from laptop to prod.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <LiquidButton
              size="default"
              className="h-10 px-6 text-xs font-semibold uppercase tracking-wider text-white"
              onClick={() => {
                window.location.href = `${appUrl}/sign-up`;
              }}
            >
              Start free
            </LiquidButton>
            <LiquidButton
              size="default"
              className="h-10 px-6 text-xs font-semibold uppercase tracking-wider text-white"
              onClick={() => {
                window.location.href = `${appUrl}/sign-in`;
              }}
            >
              Sign in
            </LiquidButton>
          </div>
        </div>

        {/* Trace Terminal Window with proper container width and margins */}
        <FrostedGlassCard
          className="hero-rise mx-auto mt-14 w-full max-w-2xl !p-0 text-left border border-white/20 shadow-2xl overflow-hidden"
          style={{ animationDelay: '120ms' }}
        >
          <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
              <span className="ml-2 font-mono text-xs text-[var(--spectre-cyan)] font-medium">
                agenticx run trace
              </span>
            </div>
            <span className="font-mono text-2xs text-white/70">v0.1.0</span>
          </div>
          <div className="divide-y divide-white/10 p-4 sm:p-5 font-mono text-xs sm:text-sm leading-6 text-white">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[var(--spectre-cyan)] font-medium">planner</span>
              <span className="text-white font-normal">decompose goal</span>
              <span className="text-emerald-400 font-medium">200 OK</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-amber-400 font-medium">sub#1</span>
              <span className="text-white font-normal">research: identify KPIs</span>
              <span className="text-emerald-400 font-medium">200 OK</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-indigo-400 font-medium">sub#2</span>
              <span className="text-white font-normal">tool:web_search · fetch metrics</span>
              <span className="text-emerald-400 font-medium">200 OK</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-rose-400 font-medium">eval</span>
              <span className="text-white font-normal">judge · score vs expected</span>
              <span className="text-emerald-400 font-medium">200 OK</span>
            </div>
          </div>
        </FrostedGlassCard>
      </section>

      {/* Primitives */}
      <section className="relative border-t border-white/10 px-4 sm:px-6 lg:px-8 py-24">
        <Reveal>
          <div className="mx-auto max-w-6xl">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <p className="spectre-eyebrow">Primitives</p>
              <h2 className="spectre-title mt-3 text-2xl sm:text-4xl text-white font-bold tracking-tight">
                Planning, traces, and evals — scoped to your org.
              </h2>
              <p className="mt-4 text-sm sm:text-[15px] leading-relaxed !text-white font-normal drop-shadow-sm">
                Each piece maps to a real surface in the product: the planner, the run detail view, the
                eval harness, Clerk roles, Stripe quotas, and E2B tool execution.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {PRIMITIVES.map(([title, body]) => (
                <FrostedGlassCard
                  key={title}
                  className="p-6 transition-all duration-200 hover:-translate-y-1 hover:border-white/30"
                >
                  <h3 className="font-mono text-sm sm:text-base font-semibold tracking-wide text-[var(--spectre-cyan)]">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed !text-white font-normal">{body}</p>
                </FrostedGlassCard>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="relative border-t border-white/10 px-4 sm:px-6 lg:px-8 py-24" id="faq">
        <Reveal>
          <div className="mx-auto max-w-4xl">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <p className="spectre-eyebrow">FAQ</p>
              <h2 className="spectre-title mt-3 text-2xl sm:text-4xl text-white font-bold tracking-tight">
                Concrete answers, not marketing filler.
              </h2>
            </div>
            <div className="max-w-3xl mx-auto">
              <MotionAccordion
                className="mt-6"
                items={FAQ.map(({ q, a }) => ({
                  question: q,
                  answer: a,
                }))}
              />
            </div>
          </div>
        </Reveal>
      </section>

      {/* Closing CTA */}
      <section className="relative border-t border-white/10 px-4 sm:px-6 lg:px-8 py-24">
        <Reveal>
          <div className="mx-auto max-w-4xl">
            <FrostedGlassCard className="p-8 sm:p-12 text-center border border-white/20 shadow-2xl" as="div">
              <h2 className="spectre-title text-2xl sm:text-4xl text-white font-bold tracking-tight">
                Run your first traced goal today.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm sm:text-[15px] leading-relaxed !text-white font-normal drop-shadow-sm">
                Create a free org, submit a goal, and open the run detail view — planner steps, tool
                calls, and eval scores in one place.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                <LiquidButton
                  size="xl"
                  className="px-8 h-11 text-xs sm:text-sm font-semibold uppercase tracking-wider text-white"
                  onClick={() => {
                    window.location.href = `${appUrl}/sign-up`;
                  }}
                >
                  Start free
                </LiquidButton>
                <LiquidButton
                  size="xl"
                  className="px-8 h-11 text-xs sm:text-sm font-semibold uppercase tracking-wider text-white"
                  onClick={() => {
                    window.location.href = '/pricing';
                  }}
                >
                  View pricing
                </LiquidButton>
              </div>
            </FrostedGlassCard>
          </div>
        </Reveal>
      </section>
    </main>
  );
}

import { FrostedGlassCard } from '@/components/ui/frosted-glass-card';

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const isPrivacy = kind === 'privacy';
  const title = isPrivacy ? 'Privacy Policy & Data Handling' : 'Terms of Service';

  return (
    <main className="relative mx-auto max-w-4xl px-6 py-24 text-white">
      <p className="spectre-eyebrow">Enterprise Trust · Compliance</p>
      <h1 className="spectre-title mt-3 text-2xl sm:text-3xl">{title}</h1>

      <FrostedGlassCard className="mt-8 space-y-6" as="div">
        {isPrivacy ? (
          <>
            <div>
              <h2 className="text-lg font-semibold text-white">1. Data Architecture & Tenant Isolation</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                AgentOps strictly isolates customer data by Organization ID in PostgreSQL. Customer code,
                evaluations, run steps, and tool execution logs are partitioned at the database layer and
                cannot be accessed across organizations.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white">2. Network Egress & LLM Providers</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                In cloud deployments, model inference requests containing task instructions and filtered
                predecessor outputs are transmitted over encrypted TLS directly to your designated LLM provider
                (Anthropic or OpenAI-compatible gateways). In enterprise self-hosted mode with local models
                (Ollama / vLLM), zero data leaves your network perimeter.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white">3. Secrets & Tool Call Sanitization</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                All sub-agent tool invocations pass through an automated credential scrubbing engine. Sensitive
                tokens, API keys, passwords, and bearer tokens are automatically redacted to [REDACTED] prior to
                database persistence in tool audit logs.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white">4. Data Retention & Erasure</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                Workspace artifacts and execution transcripts are retained for 30–90 days by default. Organization
                administrators may permanently delete any run and its audit history at any time via the REST API
                or the AgentOps dashboard.
              </p>
            </div>
          </>
        ) : (
          <>
            <div>
              <h2 className="text-lg font-semibold text-white">1. Platform Services</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                AgentOps provides autonomous multi-agent orchestration, tool calling, execution sandboxes, and
                evaluation benchmarking for modern engineering teams.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white">2. Acceptable Use & Sandboxing</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                Users are responsible for tool configurations and Python code executed within agent sandboxes.
                Automated security monitors restrict forbidden system calls, network traversal, and unauthorized
                process spawning.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-white">3. Subscriptions & Metering</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                Paid tiers are billed monthly or annually via Stripe. Metered usage for steps and token consumption
                is recorded and invoiced according to selected plan limits.
              </p>
            </div>
          </>
        )}
      </FrostedGlassCard>
    </main>
  );
}

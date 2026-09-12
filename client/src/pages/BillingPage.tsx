import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type MeResponse } from '../lib/api';
import { Card, ErrorBanner, SectionHeader, Spinner } from '../components/ui';

export function BillingPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .me()
      .then((next) => {
        setMe(next);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load usage details'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <p className="retro-kicker">Diagnostics & Quotas</p>
        <h1 className="retro-title mt-1">Usage & System Status</h1>
        <p className="mt-1 text-xs text-muted">
          Personal Edition · All multi-agent orchestration features, live tools, and eval harnesses are unlocked and unlimited.
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      <Card className="overflow-hidden border border-white/10 bg-black/40">
        <SectionHeader title="Edition & Quotas" subtitle="Personal Project Mode" />
        <div className="space-y-4 p-5">
          {loading && (
            <div className="flex items-center gap-2 text-muted">
              <Spinner />
              <span className="font-mono text-xs">loading metrics…</span>
            </div>
          )}
          {me && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xl font-bold text-[var(--spectre-cyan)]">
                    Personal Edition
                  </span>
                  <span className="inline-flex items-center rounded-full border border-ok/40 bg-ok/10 px-2.5 py-0.5 font-mono text-2xs text-ok">
                    ● Unlimited Quotas
                  </span>
                </div>
                <Link
                  to="/api"
                  className="rounded border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-xs text-white/80 hover:bg-white/10 hover:text-white transition-colors"
                >
                  Configure API Keys →
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="rounded border border-white/10 bg-white/5 p-3.5">
                  <p className="font-mono text-2xs uppercase text-white/50">Monthly Runs</p>
                  <p className="mt-1 font-mono text-2xl text-fg font-semibold">
                    {me.usage_runs.toLocaleString()}
                  </p>
                  <p className="mt-1 font-mono text-2xs text-ok">No quota limit</p>
                </div>

                <div className="rounded border border-white/10 bg-white/5 p-3.5">
                  <p className="font-mono text-2xs uppercase text-white/50">Tokens Processed</p>
                  <p className="mt-1 font-mono text-2xl text-fg font-semibold">
                    {me.usage_tokens.toLocaleString()}
                  </p>
                  <p className="mt-1 font-mono text-2xs text-[var(--spectre-cyan)]">Token-optimized engine</p>
                </div>

                <div className="rounded border border-white/10 bg-white/5 p-3.5">
                  <p className="font-mono text-2xs uppercase text-white/50">Active Workspace</p>
                  <p className="mt-1 font-mono text-lg text-fg truncate">
                    {me.active_org_name || 'Local Workspace'}
                  </p>
                  <p className="mt-1 font-mono text-2xs text-white/40">Single-tenant / Personal</p>
                </div>
              </div>
            </>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden border border-white/10 bg-black/40">
        <SectionHeader title="System Capabilities & Security" subtitle="Standard Features Included" />
        <div className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
            <div className="flex items-start gap-2 rounded border border-white/5 bg-white/[0.02] p-3">
              <span className="text-ok">✓</span>
              <div>
                <p className="font-semibold text-fg">Multi-Agent Swarm Orchestrator</p>
                <p className="text-2xs text-muted mt-0.5">Autonomous goal decomposition into researcher, analyst, and writer sub-agents.</p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded border border-white/5 bg-white/[0.02] p-3">
              <span className="text-ok">✓</span>
              <div>
                <p className="font-semibold text-fg">DuckDuckGo Web Search</p>
                <p className="text-2xs text-muted mt-0.5">Live zero-cost web search integration with concise snippet pruning.</p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded border border-white/5 bg-white/[0.02] p-3">
              <span className="text-ok">✓</span>
              <div>
                <p className="font-semibold text-fg">AST-Hardened Python Sandbox</p>
                <p className="text-2xs text-muted mt-0.5">Safe data analytics (pandas, numpy, math) with strict AST module isolation.</p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded border border-white/5 bg-white/[0.02] p-3">
              <span className="text-ok">✓</span>
              <div>
                <p className="font-semibold text-fg">Document Intelligence</p>
                <p className="text-2xs text-muted mt-0.5">Automated parsing for PDF, Excel, CSV, JSON, and Markdown with 32KB smart sampling.</p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded border border-white/5 bg-white/[0.02] p-3">
              <span className="text-ok">✓</span>
              <div>
                <p className="font-semibold text-fg">LLM-as-a-Judge Eval Harness</p>
                <p className="text-2xs text-muted mt-0.5">Automated regression testing across adversarial and benchmark scenarios.</p>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded border border-white/5 bg-white/[0.02] p-3">
              <span className="text-ok">✓</span>
              <div>
                <p className="font-semibold text-fg">Multi-Provider Flexibility</p>
                <p className="text-2xs text-muted mt-0.5">Support for OpenRouter, Groq, Anthropic Claude, OpenAI, and local Ollama.</p>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

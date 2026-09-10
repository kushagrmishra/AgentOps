import { FrostedGlassCard } from '@/components/ui/frosted-glass-card';

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const title = kind === 'terms' ? 'Terms of Service' : 'Privacy Policy';
  return (
    <main className="relative mx-auto max-w-3xl px-6 py-24">
      <p className="spectre-eyebrow">Legal · archive</p>
      <h1 className="spectre-title mt-3 text-2xl sm:text-3xl">{title}</h1>

      <FrostedGlassCard className="mt-8 !border-[var(--money-gold)]/30" as="div">
        <p className="font-mono text-xs uppercase tracking-wider text-[var(--money-gold)]">
          Needs counsel review
        </p>
        <p className="mt-2 text-sm text-muted">
          Boilerplate only — not legal advice. Replace before accepting paying customers.
        </p>
      </FrostedGlassCard>

      <FrostedGlassCard className="mt-4 space-y-4" as="div">
        <p className="text-sm leading-relaxed text-muted">
          This document is a placeholder for AgentOps. Replace it with counsel-reviewed terms before
          accepting paying customers.
        </p>
        <p className="text-sm leading-relaxed text-muted">
          We process account data via Clerk, billing via Stripe, application data in Supabase Postgres,
          and operational telemetry via Sentry/PostHog as described in our architecture docs.
        </p>
      </FrostedGlassCard>
    </main>
  );
}

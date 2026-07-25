export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const title = kind === 'terms' ? 'Terms of Service' : 'Privacy Policy';
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-6 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
        Needs legal review before launch. This is boilerplate only, not legal advice.
      </div>
      <h1 className="text-3xl font-semibold">{title}</h1>
      <div className="prose prose-invert mt-6 space-y-4 text-sm text-muted">
        <p>
          This document is a placeholder for AgentOps. Replace it with counsel-reviewed terms before
          accepting paying customers.
        </p>
        <p>
          We process account data via Clerk, billing via Stripe, application data in Supabase Postgres,
          and operational telemetry via Sentry/PostHog as described in our architecture docs.
        </p>
      </div>
    </main>
  );
}

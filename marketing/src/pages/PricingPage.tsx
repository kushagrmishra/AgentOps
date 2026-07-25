const TIERS = [
  { name: 'Free', price: '$0', blurb: '20 runs / 200k tokens per month', cta: 'Start free' },
  { name: 'Pro', price: '$49', blurb: '500 runs / 5M tokens per month', cta: 'Upgrade to Pro' },
  { name: 'Team', price: '$199', blurb: '5k runs / 50M tokens, org seats', cta: 'Upgrade to Team' },
];

export function PricingPage({ appUrl }: { appUrl: string }) {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
      <p className="mt-2 text-sm text-muted">Mapped to real Stripe products. Quotas enforced on the API.</p>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {TIERS.map((tier) => (
          <article key={tier.name} className="rounded-xl border border-line bg-panel p-6">
            <h2 className="text-lg font-semibold">{tier.name}</h2>
            <p className="mt-3 text-3xl font-semibold">{tier.price}<span className="text-sm text-muted">/mo</span></p>
            <p className="mt-3 text-sm text-muted">{tier.blurb}</p>
            <a
              href={`${appUrl}/sign-up`}
              className="mt-6 inline-flex rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white"
            >
              {tier.cta}
            </a>
          </article>
        ))}
      </div>
    </main>
  );
}
